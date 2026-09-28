/**
 * Auth-mails afsendt af appen selv (nodemailer over Doccys' egen SMTP —
 * Namecheap Private Email), med tekst fra messages-filerne i modtagerens
 * sprog. Erstatter Supabases indbyggede engelske skabeloner, som kun
 * findes på ét sprog pr. projekt.
 *
 * Teksterne hentes via next-intl fra `mail`-namespacet (bevist mønster
 * i bevis-ruten); HTML-delen er table-baseret med inline styles — mail-
 * klienter ignorerer eksterne stylesheets, og Outlook håndterer padding
 * på <a> urent, derfor er knappen en tabel-celle. Bevidst LYS baggrund:
 * mørke HTML-mails er spamfilter- og dark/light-mode-følsomme — brand-
 * farverne bæres af knappen og overskriften.
 *
 * From-adressen er HÅRDKODET "Doccys <contact@doccys.com>": den er den
 * SPF-alignede afsender (Namecheap-licensen), og DMARC-misalignment fra
 * andre @doccys.com-adresser er en kendt faldgrube — intet env, så en
 * konfigurationsfejl ikke kan misaligne.
 *
 * SMTP-adgangskoden bor KUN i miljøet (.env.local / Vercel env) — aldrig
 * i kode eller git: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS.
 */
import nodemailer, { type Transporter } from "nodemailer";
import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/routing";

/** Slap-afsenderen — se filens header om hvorfor den er hårdkodet. */
const FROM = "Doccys <contact@doccys.com>";

let mailer: Transporter | null = null;

function getMailer(): Transporter {
  if (mailer) return mailer;
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
    throw new Error(
      "SMTP-env mangler: SMTP_HOST, SMTP_PORT, SMTP_USER og SMTP_PASS skal være sat (.env.local / Vercel)",
    );
  }
  const port = Number(SMTP_PORT);
  mailer = nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  return mailer;
}

interface SendAuthMailArgs {
  /** Modtagerens e-mail. */
  to: string;
  /** Modtagerens sprog — bestemmer mail-teksten (routing-locales). */
  locale: Locale;
  /** Mailtype: signup-bekræftelse eller password-nulstilling. */
  kind: "signup" | "recovery";
  /** Engangs-linket (bygget af kalderen af hashed_token). */
  link: string;
  /** Brugerens navn til signup-hilsenen (optional for recovery). */
  name?: string;
}

/** Overskrifterne og farverne — brandtokens fra globals.css. */
const C = { noir: "#08080a", ash: "#9a9aa8", champagne: "#d4b678" };

export async function sendAuthMail({
  to,
  locale,
  kind,
  link,
  name,
}: SendAuthMailArgs): Promise<void> {
  const t = await getTranslations({ locale, namespace: "mail" });
  const ns = kind === "signup" ? "signup" : "reset";
  const subject = t(`${ns}.subject`);
  const heading = t(`${ns}.heading`);
  const body =
    kind === "signup" ? t("signup.body", { name: name ?? "" }) : t("reset.body");
  const button = t(`${ns}.button`);
  const expiry = t(`${ns}.expiry`);
  const note =
    kind === "signup" ? t("signup.ignore") : t("reset.security");

  const html = `<!doctype html>
<html lang="${locale}">
<body style="margin:0;padding:0;background:#f4f4f2;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f2;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;padding:32px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
        <tr><td style="font-size:13px;letter-spacing:2px;text-transform:uppercase;color:${C.champagne};font-weight:600;padding-bottom:8px;">Doccys</td></tr>
        <tr><td style="font-size:24px;color:${C.noir};font-weight:700;padding-bottom:12px;">${heading}</td></tr>
        <tr><td style="font-size:16px;line-height:1.6;color:#333333;padding-bottom:24px;">${body}</td></tr>
        <tr><td style="padding-bottom:24px;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="background:${C.champagne};border-radius:8px;">
              <a href="${link}" style="display:inline-block;padding:12px 28px;color:${C.noir};font-size:14px;font-weight:600;text-decoration:none;border-radius:8px;">${button}</a>
            </td>
          </tr></table>
        </td></tr>
        <tr><td style="font-size:14px;line-height:1.6;color:${C.ash};padding-bottom:4px;">${expiry}</td></tr>
        <tr><td style="font-size:14px;line-height:1.6;color:${C.ash};">${note}</td></tr>
        <tr><td style="padding-top:28px;border-top:1px solid #eeeeee;margin-top:24px;">
          <p style="margin:8px 0;font-size:12px;color:${C.ash};">${t("tagline")}</p>
          <p style="margin:8px 0;font-size:12px;color:${C.ash};">${t("support")}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = `${heading}

${body}

${button}: ${link}

${expiry}
${note}

${t("tagline")}
${t("support")}
`;

  await getMailer().sendMail({ from: FROM, to, subject, text, html });
}