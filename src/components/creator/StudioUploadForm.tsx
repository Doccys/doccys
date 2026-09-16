"use client";

import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";
import { FILM_VIDEOS_BUCKET } from "@/lib/storage/filmVideos";
import {
  FILM_POSTERS_BUCKET,
  POSTER_EXTENSIONS,
  POSTER_MAX_BYTES,
  POSTER_MIN_WIDTH,
  POSTER_MIN_HEIGHT,
} from "@/lib/storage/filmPosters";
import { POSTER_GRADIENTS } from "@/lib/data/gradients";
import { FILM_GENRES } from "@/lib/data/genres";

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

type Phase = "idle" | "probing" | "uploading" | "saving" | "done";

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
  const [genres, setGenres] = useState<string[]>([]);
  const [gradient, setGradient] = useState<string>(POSTER_GRADIENTS[0]);
  const [file, setFile] = useState<File | null>(null);
  const [durationSec, setDurationSec] = useState<number | null>(null);
  const [posterFile, setPosterFile] = useState<File | null>(null);
  const [posterDims, setPosterDims] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [posterPreviewUrl, setPosterPreviewUrl] = useState<string | null>(null);

  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);

  const busy = phase === "uploading" || phase === "saving" || phase === "probing";

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

    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      setError(t("errors.notLoggedIn"));
      return;
    }

    // 1) Upload forsidebillede (valgfrit — og lille, så det kommer
    //    først). Failer det, er intet endnu spildt.
    setPhase("uploading");
    let posterPath: string | null = null;
    if (posterFile) {
      const ext = POSTER_EXTENSIONS[posterFile.type];
      posterPath = `${session.user.id}/${crypto.randomUUID()}.${ext}`;
      const { error: posterError } = await supabase.storage
        .from(FILM_POSTERS_BUCKET)
        .upload(posterPath, posterFile);
      if (posterError) {
        console.warn("StudioUploadForm (plakat):", posterError.message);
        setPhase("idle");
        setError(t("errors.posterFailed"));
        return;
      }
    }

    // 2) Upload video til egen mappe i film-videos-bucketet
    const path = `${session.user.id}/${crypto.randomUUID()}.mp4`;
    // File-objekter uden mime (file.type === "") sender tom type i
    // FormData og afvises af bucketen — tving video/mp4 for filer, der
    // netop er valideret som mp4 i handleFileChange.
    const videoBody =
      file.type === "" ? new Blob([file], { type: "video/mp4" }) : file;
    const { error: uploadError } = await supabase.storage
      .from(FILM_VIDEOS_BUCKET)
      .upload(path, videoBody, { contentType: "video/mp4" });
    if (uploadError) {
      console.warn("StudioUploadForm (upload):", uploadError.message);
      setPhase("idle");
      // Bedste indsats: plakaten er allerede oppe — fjern den igen
      if (posterPath) {
        await supabase.storage
          .from(FILM_POSTERS_BUCKET)
          .remove([posterPath])
          .catch(() => undefined);
      }
      // Bucketens mime-tjek er skrapt (storage-js sender filens EGEN
      // type, ikke vores option) — omdøbte filer fejler her med 415.
      // En udløbet session giver en RLS-fejl i stedet.
      const msg = uploadError.message ?? "";
      if (msg.includes("mime type")) {
        setError(t("errors.notMp4"));
      } else if (msg.includes("row-level security")) {
        setError(t("errors.notLoggedIn"));
      } else {
        setError(t("errors.uploadFailed"));
      }
      return;
    }

    // 3) Opret film-rækken som kladde via API'en (validering +
    //    tvungen draft-status + slug-generering)
    setPhase("saving");
    const { data } = supabase.storage
      .from(FILM_VIDEOS_BUCKET)
      .getPublicUrl(path);
    const publicUrl = `${data.publicUrl}`;
    let posterUrl: string | undefined;
    if (posterPath) {
      const { data: posterData } = supabase.storage
        .from(FILM_POSTERS_BUCKET)
        .getPublicUrl(posterPath);
      posterUrl = posterData.publicUrl;
    }

    try {
      const res = await fetch("/api/films", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          synopsis: synopsis.trim(),
          year: Number(year),
          genres,
          gradient,
          durationSec,
          videoUrl: publicUrl,
          ...(posterUrl ? { posterUrl } : {}),
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
      setGenres([]);
      setGradient(POSTER_GRADIENTS[0]);
      setFile(null);
      setDurationSec(null);
      clearPoster();
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (posterInputRef.current) posterInputRef.current.value = "";
      // Film-listen på siden genhentes server-side
      router.refresh();
    } catch (err) {
      // Rækken kunne ikke oprettes → fjern de netop uploadede
      // objekter, så intet hænger løst i bucketene
      await supabase.storage.from(FILM_VIDEOS_BUCKET).remove([path]);
      if (posterPath) {
        await supabase.storage.from(FILM_POSTERS_BUCKET).remove([posterPath]);
      }
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
        <span className="text-sm text-ash">{t("gradientLabel")}</span>
        <div className="mt-2 flex flex-wrap gap-2.5">
          {POSTER_GRADIENTS.map((candidate) => (
            <button
              key={candidate}
              type="button"
              onClick={() => setGradient(candidate)}
              disabled={busy}
              aria-label={t("gradientLabel")}
              className={`h-10 w-16 rounded-lg bg-linear-to-br transition-transform ${
                candidate
              } ${
                gradient === candidate
                  ? "ring-2 ring-champagne"
                  : "opacity-70 hover:opacity-100"
              }`}
            />
          ))}
        </div>
      </div>

      <label className="mt-5 block">
        <span className="text-sm text-ash">{t("posterLabel")}</span>
        <input
          ref={posterInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handlePosterChange}
          disabled={busy}
          className={`mt-1.5 file:mr-4 file:rounded-full file:border-0 file:bg-champagne file:px-4 file:py-1.5 file:text-xs file:font-medium file:text-noir ${inputClassName}`}
        />
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
      </label>

      <label className="mt-5 block">
        <span className="text-sm text-ash">{t("fileLabel")}</span>
        <input
          ref={fileInputRef}
          type="file"
          accept="video/mp4"
          onChange={handleFileChange}
          disabled={busy}
          className={`mt-1.5 file:mr-4 file:rounded-full file:border-0 file:bg-champagne file:px-4 file:py-1.5 file:text-xs file:font-medium file:text-noir ${inputClassName}`}
        />
        {durationSec !== null && file && (
          <span className="mt-1.5 block text-xs text-ash/70">
            {t("durationDetected", { seconds: durationSec })}
          </span>
        )}
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
          : phase === "saving"
            ? t("saving")
            : phase === "probing"
              ? t("probing")
              : t("creatorNote", { handle: creatorHandle })}
      </p>

      <div className="mt-6">
        <button
          type="submit"
          disabled={busy || !file || durationSec === null}
          className="rounded-full bg-champagne px-6 py-2.5 text-sm font-medium text-noir transition-colors hover:bg-bone disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? t("working") : t("submit")}
        </button>
      </div>
    </form>
  );
}