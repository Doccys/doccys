"use client";

import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  FILM_VIDEOS_BUCKET,
  VIDEO_MAX_BYTES,
} from "@/lib/storage/filmVideos";
import {
  FILM_POSTERS_BUCKET,
  POSTER_EXTENSIONS,
  POSTER_MAX_BYTES,
  POSTER_MIN_WIDTH,
  POSTER_MIN_HEIGHT,
} from "@/lib/storage/filmPosters";
import { FILM_GENRES } from "@/lib/data/genres";
import {
  LOCALE_LANGUAGE_NAMES,
  PLATFORM_LOCALES,
} from "@/lib/i18n/languageNames";

/**
 * Upload-formular med statens maskine:
 *
 *   idle → probing → uploading → saving → done
 *
 * Rækkefølge er bevidst: FØRST uploades videoen til storage, SÅ
 * oprettes film-rækken via /api/films — en række uden objekt ville
 * ellers sidde permanent defekt i studiet. En video uden række ved
 * et client-crash midt i flowet er derimod usynlig og harmløs.
 *
 * Fejler række-oprettelsen, fjernes objektet igen (ingen forældreløse
 * rækker). Uploaden viser indetermineret fremskridt — supabase-js
 * har ingen progress-callback.
 */

type Phase =
  | "idle"
  | "probing"
  | "uploading"
  | "bunnyPrepare"
  | "bunnyUpload"
  | "bunnyEncode"
  | "saving"
  | "done";

/**
 * TUS-genoptageligt upload (Bunny Stream, 9/11): serveren (bunny-start)
 * opretter videorækken og signerer; klienten uploader herefter DIREKTE
 * til video.bunnycdn.com/tusupload — Vercels 4,5 MB request-body-grænse
 * forbyder server-gennemstrømning af 2 GB-filer, og Bunnys TUS-endpoint
 * tager browser-opload med CORS. Headere gentages ved PATCH (Bunny
 * validerer signaturen ved hvert kald); chunk-størrelse 16 MB med
 * 3 forsøg pr. chunk, og HEAD-forsøget genoptager, hvis forbindelsen
 * ryger midtvejs.
 */
const TUS_ENDPOINT = "https://video.bunnycdn.com/tusupload";
const TUS_CHUNK_BYTES = 16 * 1024 * 1024;
const TUS_CHUNK_RETRIES = 3;

interface BunnyUploadTicket {
  videoId: string;
  tusSignature: string;
  tusExpire: number;
  libraryId: string;
}

async function tusUpload(
  file: File,
  ticket: BunnyUploadTicket,
  onProgress?: (andel: number) => void,
): Promise<void> {
  const headers = (): Record<string, string> => ({
    AuthorizationSignature: ticket.tusSignature,
    AuthorizationExpire: String(ticket.tusExpire),
    LibraryId: ticket.libraryId,
    VideoId: ticket.videoId,
  });

  // Genoptagelse: TUS-HEAD afslører, hvor uploaden kom fra — en
  // gensendt side/brudt fetch fortsätter, hvor den slap.
  let offset = 0;
  let head = await fetch(TUS_ENDPOINT, {
    method: "HEAD",
    headers: headers(),
  });
  if (!head.ok && head.status !== 404) {
    throw new Error(`tus-head-${head.status}`);
  }
  const headOffset = Number(head.headers.get("Upload-Offset"));
  if (Number.isFinite(headOffset) && headOffset > 0 && headOffset <= file.size) {
    offset = headOffset;
  }

  while (offset < file.size) {
    const slutt = Math.min(offset + TUS_CHUNK_BYTES, file.size);
    const chunk = file.slice(offset, slutt);
    let ny = Number.NaN;
    for (let attempt = 0; attempt < TUS_CHUNK_RETRIES; attempt++) {
      const res = await fetch(TUS_ENDPOINT, {
        method: "PATCH",
        headers: {
          ...headers(),
          "Upload-Offset": String(offset),
          "Content-Type": "application/offset+octet-stream",
        },
        body: chunk,
      });
      if (res.status === 204) {
        const resOffset = Number(res.headers.get("Upload-Offset"));
        if (Number.isFinite(resOffset)) ny = resOffset;
        break;
      }
      if (attempt === TUS_CHUNK_RETRIES - 1) {
        throw new Error(`tus-patch-${res.status}`);
      }
    }
    if (!Number.isFinite(ny) || ny <= offset) {
      throw new Error("tus-offset");
    }
    offset = ny;
    if (onProgress) {
      onProgress(offset / file.size);
    }
  }
}

/** Encoder-pollen: Bunny klargør kladen efter upload (status 3 =
 * Finished). Venter op til ~10 minutter i 3-sekunders runde. */
async function pollBunnyEncode(
  videoId: string,
): Promise<"ready" | "failed" | "timeout"> {
  for (let runde = 0; runde < 200; runde++) {
    const res = await fetch(`/api/films/bunny-status?id=${videoId}`);
    if (res.ok) {
      const body = (await res.json()) as { status: number };
      if (body.status >= 3) return body.status === 3 ? "ready" : "failed";
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  return "timeout";
}

const inputClassName =
  "w-full rounded-lg border border-smoke bg-onyx px-4 py-2.5 text-sm text-bone placeholder:text-ash/60 focus:border-champagne focus:outline-none";

/** Læser filens længde lokalt fra metadata — uden serveren. */
function probeDurationSec(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(video.duration);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("metadata"));
    };
    video.src = url;
  });
}

/** Læser billedets pixel-dimensioner lokalt — uden serveren. */
function probePosterSize(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image"));
    };
    image.src = url;
  });
}

export default function StudioUploadForm({
  creatorHandle,
}: {
  creatorHandle: string;
}) {
  const t = useTranslations("creatorStudio");
  const genreT = useTranslations("genres");
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const posterInputRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState("");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [synopsis, setSynopsis] = useState("");
  const [spokenLanguage, setSpokenLanguage] = useState<string>("da");
  const [genres, setGenres] = useState<string[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [durationSec, setDurationSec] = useState<number | null>(null);
  const [posterFile, setPosterFile] = useState<File | null>(null);
  const [posterDims, setPosterDims] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [posterPreviewUrl, setPosterPreviewUrl] = useState<string | null>(null);
  // Licens-accept pr. film (Handelsbetingelserne afsnit 11): resettes
  // ved success, så hver ny upload bekræftes individuelt.
  const [licenseAccepted, setLicenseAccepted] = useState(false);

  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  /** TUS-uploadens andel (0-100) — visning pr. pro-cent i statuslinjen */
  const [bunnyPercent, setBunnyPercent] = useState(0);

  const busy = phase !== "idle" && phase !== "done";

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    setError(null);
    setDurationSec(null);
    const selected = event.target.files?.[0] ?? null;
    setFile(selected);
    if (!selected) return;

    // Ægte mp4: browseren melder video/mp4 (sjældent: tom type, når
    // filen mangler mime-registrering, men har .mp4-endelse). Alt
    // andet — omdøbt .mov/.mkv/.webm osv. — afvises HER i stedet for
    // at fejle tavst ved upload (storage-js ignorerer contentType-
    // optionen for File-objekter, og bucketen tillader kun video/mp4).
    const isMp4 =
      selected.type === "video/mp4" ||
      (selected.type === "" && selected.name.toLowerCase().endsWith(".mp4"));
    if (!isMp4) {
      setError(t("errors.notMp4"));
      setFile(null);
      return;
    }
    // 2 GB-håndhævelsen, led 1 (punkt 16): her koster det INGENTING —
    // en overgrænse-fil uploades slet ikke (POST /api/films tjekker
    // det samme igen server-side via HEAD'ens content-length, da
    // File.size kan lyves om).
    if (selected.size > VIDEO_MAX_BYTES) {
      setError(t("errors.videoTooBig"));
      setFile(null);
      return;
    }
    setPhase("probing");
    try {
      const duration = await probeDurationSec(selected);
      if (!Number.isFinite(duration) || duration <= 0) {
        setError(t("errors.probe"));
        setFile(null);
        setDurationSec(null);
      } else {
        setDurationSec(Math.round(duration));
      }
    } catch {
      setError(t("errors.probe"));
      setFile(null);
    } finally {
      setPhase("idle");
    }
  };

  const toggleGenre = (genre: string) => {
    setGenres((prev) =>
      prev.includes(genre)
        ? prev.filter((g) => g !== genre)
        : prev.length >= 5
          ? prev
          : [...prev, genre],
    );
  };

  const clearPoster = () => {
    setPosterFile(null);
    setPosterDims(null);
    if (posterPreviewUrl) URL.revokeObjectURL(posterPreviewUrl);
    setPosterPreviewUrl(null);
  };

  const handlePosterChange = async (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    setError(null);
    const selected = event.target.files?.[0] ?? null;
    if (!selected) {
      clearPoster();
      return;
    }

    // Ægte billede: bucketen tillader kun jpeg/png/webp — og
    // File-objekter sender deres EGEN type i FormData (content-
    // Type-optionen ignoreres), så omdøbte filer fejler ellers
    // tavst ved upload med 415.
    const ext = POSTER_EXTENSIONS[selected.type];
    if (!ext) {
      setError(t("errors.notPoster"));
      clearPoster();
      return;
    }
    if (selected.size > POSTER_MAX_BYTES) {
      setError(t("errors.posterTooBig"));
      clearPoster();
      return;
    }

    try {
      const dims = await probePosterSize(selected);
      if (
        dims.width < POSTER_MIN_WIDTH ||
        dims.height < POSTER_MIN_HEIGHT
      ) {
        setError(t("errors.posterTooSmall"));
        clearPoster();
        return;
      }
      clearPoster();
      setPosterFile(selected);
      setPosterDims(dims);
      setPosterPreviewUrl(URL.createObjectURL(selected));
    } catch {
      setError(t("errors.posterProbe"));
      clearPoster();
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setError(null);

    // Forsidebilledet er PÅKRÆVT (20/9): tapetvalget er fjernet —
    // uden et rigtigt foto blev filmenes kort kedelige farveflader.
    if (!posterFile) {
      setError(t("errors.posterRequired"));
      return;
    }

    if (
      !file ||
      durationSec === null ||
      title.trim().length < 2 ||
      synopsis.trim().length < 1 ||
      genres.length < 1
    ) {
      setError(t("errors.missingFields"));
      return;
    }

    // Licens-accept (Handelsbetingelserne afsnit 11): sidste tjek
    // FØR sessionen og FØR noget som helst uploades til storage —
    // en manglende accept må aldrig efterlade objekter i bucketene.
    // API'en og insert-policyn håndhæver det samme igen server-side.
    if (!licenseAccepted) {
      setError(t("errors.license"));
      return;
    }

    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      setError(t("errors.notLoggedIn"));
      return;
    }

    // 1) Upload forsidebilledet (PÅKRÆVT — og lille, så det kommer
    //    først). Failer det, er intet endnu spildt.
    setPhase("uploading");
    const ext = POSTER_EXTENSIONS[posterFile.type];
    const posterPath = `${session.user.id}/${crypto.randomUUID()}.${ext}`;
    const { error: posterError } = await supabase.storage
      .from(FILM_POSTERS_BUCKET)
      .upload(posterPath, posterFile);
    if (posterError) {
      console.warn("StudioUploadForm (plakat):", posterError.message);
      setPhase("idle");
      setError(t("errors.posterFailed"));
      return;
    }

    // 2) Bunny Stream (9/11): serveren opretter videorækken + signerer,
    //    klienten uploader DIREKTE til TUS-endpointet (browser-to-Bunny —
    //    Vercels body-grænse forbyder gennemstrømning). 2 GB-tjekket
    //    (led 1) er allerede gjort ved filvalget.
    setPhase("bunnyPrepare");
    let ticket: BunnyUploadTicket;
    try {
      const res = await fetch("/api/films/bunny-start", { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
      } & Partial<BunnyUploadTicket>;
      if (!res.ok) {
        throw new Error(body.error ?? "bunny-start");
      }
      if (
        !body.videoId ||
        !body.tusSignature ||
        !body.tusExpire ||
        !body.libraryId
      ) {
        throw new Error("bunny-ticket");
      }
      ticket = {
        videoId: body.videoId,
        tusSignature: body.tusSignature,
        tusExpire: body.tusExpire,
        libraryId: body.libraryId,
      };
    } catch (err) {
      await supabase.storage
        .from(FILM_POSTERS_BUCKET)
        .remove([posterPath])
        .catch(() => undefined);
      setPhase("idle");
      console.warn("StudioUploadForm (bunny-start):", err);
      setError(
        err instanceof Error && err.message !== "bunny-start"
          ? err.message
          : t("errors.bunnyStart"),
      );
      return;
    }

    setPhase("bunnyUpload");
    setBunnyPercent(0);
    try {
      await tusUpload(file, ticket, (andel) =>
        setBunnyPercent(Math.round(andel * 100)),
      );
    } catch (err) {
      // Uploaden fejlede — ryd plakaten + det forladte Bunny-objekt
      // (bunny-delete er titeltbundet til kontoen og idempotent).
      await supabase.storage
        .from(FILM_POSTERS_BUCKET)
        .remove([posterPath])
        .catch(() => undefined);
      await fetch(`/api/films/bunny-delete?id=${ticket.videoId}`, {
        method: "POST",
      }).catch(() => undefined);
      setPhase("idle");
      console.warn("StudioUploadForm (tus):", err);
      setError(t("errors.tusUpload"));
      return;
    }

    // 3) Encoding-venten: Bunny klargør kladen — playback-URL'en er
    //    der, når de første opløsninger er encodet (status 3).
    setPhase("bunnyEncode");
    const encode = await pollBunnyEncode(ticket.videoId);
    if (encode !== "ready") {
      await supabase.storage
        .from(FILM_POSTERS_BUCKET)
        .remove([posterPath])
        .catch(() => undefined);
      await fetch(`/api/films/bunny-delete?id=${ticket.videoId}`, {
        method: "POST",
      }).catch(() => undefined);
      setPhase("idle");
      setError(
        encode === "timeout" ? t("errors.bunnyEncodeTimeout") : t("errors.bunnyEncode"),
      );
      return;
    }

    // 4) Opret film-rækken som kladde via API'en (validering +
    //    tvungen draft-status + slug-generering + Bunny-ledet)
    setPhase("saving");
    const { data: posterData } = supabase.storage
      .from(FILM_POSTERS_BUCKET)
      .getPublicUrl(posterPath);
    const posterUrl = posterData.publicUrl;

    try {
      const res = await fetch("/api/films", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          synopsis: synopsis.trim(),
          year: Number(year),
          genres,
          durationSec,
          bunnyVideoId: ticket.videoId,
          spokenLanguage,
          posterUrl,
          licenseAccepted: true,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error ?? "row");
      }

      setPhase("done");
      setTitle("");
      setYear(String(new Date().getFullYear()));
      setSynopsis("");
      setSpokenLanguage("da");
      setGenres([]);
      setFile(null);
      setDurationSec(null);
      setLicenseAccepted(false);
      setBunnyPercent(0);
      clearPoster();
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (posterInputRef.current) posterInputRef.current.value = "";
      // Film-listen på siden genhentes server-side
      router.refresh();
    } catch (err) {
      // Rækken kunne ikke oprettes → fjern de netop uploadede
      // objekter, så intet hænger løst (bunny-delete er idempotent)
      await supabase.storage.from(FILM_POSTERS_BUCKET).remove([posterPath]);
      await fetch(`/api/films/bunny-delete?id=${ticket.videoId}`, {
        method: "POST",
      }).catch(() => undefined);
      setPhase("idle");
      setError(
        err instanceof Error && err.message !== "row"
          ? err.message
          : t("errors.rowFailed"),
      );
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-smoke bg-onyx p-6"
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm text-ash">{t("titleLabel")}</span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            disabled={busy}
            className={`mt-1.5 ${inputClassName}`}
          />
        </label>
        <label className="block">
          <span className="text-sm text-ash">{t("yearLabel")}</span>
          <input
            type="number"
            value={year}
            onChange={(e) => setYear(e.target.value)}
            min={1900}
            max={new Date().getFullYear() + 1}
            disabled={busy}
            className={`mt-1.5 ${inputClassName}`}
          />
        </label>
      </div>

      {/* Talesprog: hvad der TALES i filmen — undertekst-pipelinen
          skriver lyden af på dette sprog og oversætter derfra til
          alle platformssprog. Sprogenes egne navne (ikke oversat),
          som CC-menuen i afspilleren. */}
      <label className="mt-5 block">
        <span className="text-sm text-ash">{t("spokenLanguageLabel")}</span>
        <select
          value={spokenLanguage}
          onChange={(e) => setSpokenLanguage(e.target.value)}
          disabled={busy}
          className={`mt-1.5 ${inputClassName}`}
        >
          {PLATFORM_LOCALES.map((locale) => (
            <option key={locale} value={locale}>
              {LOCALE_LANGUAGE_NAMES[locale]}
            </option>
          ))}
        </select>
        <span className="mt-1.5 block text-xs text-ash/70">
          {t("spokenLanguageHint")}
        </span>
      </label>

      <div className="mt-5">
        <span className="text-sm text-ash">{t("genresLabel")}</span>
        <div className="mt-2 flex flex-wrap gap-2">
          {FILM_GENRES.map((genre) => (
            <button
              key={genre}
              type="button"
              onClick={() => toggleGenre(genre)}
              disabled={busy}
              className={`rounded-full border px-3.5 py-1.5 text-xs transition-colors ${
                genres.includes(genre)
                  ? "border-champagne bg-champagne/15 text-champagne"
                  : "border-smoke text-ash hover:border-champagne/60 hover:text-champagne"
              }`}
            >
              {genreT(genre)}
            </button>
          ))}
        </div>
      </div>

      <label className="mt-5 block">
        <span className="text-sm text-ash">{t("synopsisLabel")}</span>
        <textarea
          value={synopsis}
          onChange={(e) => setSynopsis(e.target.value)}
          rows={4}
          maxLength={5000}
          disabled={busy}
          className={`mt-1.5 ${inputClassName}`}
        />
      </label>

      <div className="mt-5">
        {/* Native file-input-tekst ("Ingen fil valgt") følger BROWSERENS
            sprog, ikke sidens — derfor skjules inputtet (sr-only) og
            knap + filnavn tegnes selv, så alle 13 sprog holder. */}
        <label className="block" htmlFor="studio-poster-input">
          <span className="text-sm text-ash">
            {t("posterLabel")}{" "}
            <span className="text-champagne">{t("requiredMark")}</span>
          </span>
        </label>
        <input
          id="studio-poster-input"
          ref={posterInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handlePosterChange}
          disabled={busy}
          className="sr-only"
        />
        <span className="mt-1.5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => posterInputRef.current?.click()}
            disabled={busy}
            className="rounded-full bg-champagne px-4 py-1.5 text-xs font-medium text-noir transition-colors hover:bg-bone disabled:opacity-50"
          >
            {t("posterPickButton")}
          </button>
          <span
            className={`min-w-0 max-w-full truncate text-xs ${posterFile ? "text-ash" : "text-ash/70"}`}
          >
            {posterFile ? posterFile.name : t("fileNoneChosen")}
          </span>
        </span>
        <span className="mt-1.5 block text-xs text-ash/70">
          {t("posterHint")}
        </span>
        {posterPreviewUrl && posterDims && (
          <span className="mt-2 flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- storage-URL, ikke Next-billedpipeline */}
            <img
              src={posterPreviewUrl}
              alt=""
              className="h-20 w-36 rounded-lg border border-smoke object-cover"
            />
            <span className="text-xs text-champagne">
              {t("posterDetected", {
                width: posterDims.width,
                height: posterDims.height,
              })}
            </span>
          </span>
        )}
      </div>

      <div className="mt-5">
        <label className="block" htmlFor="studio-video-input">
          <span className="text-sm text-ash">{t("fileLabel")}</span>
        </label>
        <input
          id="studio-video-input"
          ref={fileInputRef}
          type="file"
          accept="video/mp4"
          onChange={handleFileChange}
          disabled={busy}
          className="sr-only"
        />
        <span className="mt-1.5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
            className="rounded-full bg-champagne px-4 py-1.5 text-xs font-medium text-noir transition-colors hover:bg-bone disabled:opacity-50"
          >
            {t("filePickButton")}
          </button>
          <span
            className={`min-w-0 max-w-full truncate text-xs ${file ? "text-ash" : "text-ash/70"}`}
          >
            {file ? file.name : t("fileNoneChosen")}
          </span>
        </span>
        {durationSec !== null && file && (
          <span className="mt-1.5 block text-xs text-ash/70">
            {t("durationDetected", { seconds: durationSec })}
          </span>
        )}
      </div>

      {/* Licens-accept (kodebasens første checkbox): ejerskabs-
          bekræftelse + brugsret, jf. Handelsbetingelserne afsnit 11.
          Kort + henvisende i alle 13 sprog — den fulde klausul står
          kun ét sted (legal.terms.sections.s11), så oversættelses-
          drift aldrig udvander licensen. Submit er disabled uden
          accept, og API/policy håndhæver det igen server-side. */}
      <label className="mt-5 flex items-start gap-3">
        <input
          type="checkbox"
          checked={licenseAccepted}
          onChange={(event) => setLicenseAccepted(event.target.checked)}
          disabled={busy}
          className="mt-0.5 h-4 w-4 shrink-0 accent-champagne"
        />
        <span className="text-sm leading-relaxed text-ash">
          {t("licenseLabel")}{" "}
          <Link
            href="/terms"
            className="text-champagne underline underline-offset-2"
          >
            {t("licenseLink")}
          </Link>
        </span>
      </label>

      {error && <p className="mt-4 text-sm text-red-400">{error}</p>}

      {phase === "done" && (
        <p className="mt-4 text-sm text-champagne">{t("success")}</p>
      )}

      {(phase === "uploading" || phase === "saving") && (
        <div className="mt-4 h-1 w-40 overflow-hidden rounded-full bg-smoke">
          <div className="h-full w-1/3 animate-pulse rounded-full bg-champagne" />
        </div>
      )}

      <p className="mt-4 text-xs text-ash/70">
        {phase === "uploading"
          ? t("uploading")
          : phase === "bunnyPrepare"
            ? t("bunnyPrepare")
            : phase === "bunnyUpload"
              ? t("bunnyUpload", { percent: bunnyPercent })
              : phase === "bunnyEncode"
                ? t("bunnyEncode")
                : phase === "saving"
                  ? t("saving")
                  : phase === "probing"
                    ? t("probing")
                    : t("creatorNote", { handle: creatorHandle })}
      </p>

      <div className="mt-6">
        <button
          type="submit"
          disabled={
            busy ||
            !file ||
            !posterFile ||
            durationSec === null ||
            !licenseAccepted
          }
          className="rounded-full bg-champagne px-6 py-2.5 text-sm font-medium text-noir transition-colors hover:bg-bone disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? t("working") : t("submit")}
        </button>
      </div>
    </form>
  );
}