import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from "aws-lambda";

const NRF_API = "https://www.nrf.org.nz/api/v2/competition/widget/fixture/Dates";

const COMP_IDS = [12881];
const ORG_IDS = [9701];
const GRADE_IDS = [722376];
const TEAM_NAME = "Purple 10M";
const CLUB_NAME = "Ellerslie AFC";
const TZ = "Pacific/Auckland";

type Fixture = {
  Id: number;
  From: string;
  To: string;
  HomeTeamName: string;
  AwayTeamName: string;
  HomeOrgName: string;
  AwayOrgName: string;
  VenueName: string;
  LocationLat: number;
  LocationLng: number;
  RoundName: string;
  StatusName: string;
};

type NrfResponse = { Fixtures?: Fixture[] };

function todayInNz(): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return { y: get("year"), m: get("month"), d: get("day") };
}

function ymd(y: number, m: number, d: number): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${y}-${pad(m)}-${pad(d)}`;
}

function escapeHtml(s: string): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };
  return s.replace(/[&<>"']/g, (c) => map[c]!);
}

function formatFixtureWhen(iso: string): { date: string; time: string } {
  const [datePart, timePart] = iso.split("T");
  const [y, m, d] = datePart.split("-").map(Number);
  const [hh, mm] = timePart.split(":").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, hh, mm));
  const date = new Intl.DateTimeFormat("en-NZ", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(dt);
  const time = new Intl.DateTimeFormat("en-NZ", {
    timeZone: "UTC",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(dt);
  return { date, time };
}

// The grade has multiple teams called "Purple 10M", so a fixture is only
// ours when both the team name and the club (org) name match.
function isOurTeam(f: Fixture, side: "Home" | "Away"): boolean {
  return side === "Home"
    ? f.HomeTeamName === TEAM_NAME && f.HomeOrgName === CLUB_NAME
    : f.AwayTeamName === TEAM_NAME && f.AwayOrgName === CLUB_NAME;
}

async function fetchFixtures(from: string, to: string): Promise<Fixture[]> {
  const res = await fetch(NRF_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Origin: "https://www.nrf.org.nz",
      Referer: "https://www.nrf.org.nz/",
    },
    body: JSON.stringify({
      CompIds: COMP_IDS,
      OrgIds: ORG_IDS,
      GradeIds: GRADE_IDS,
      From: `${from}T00:00:00`,
      To: `${to}T23:59:00`,
    }),
  });
  if (!res.ok) throw new Error(`NRF API returned ${res.status}`);
  const data = (await res.json()) as NrfResponse;
  return (data.Fixtures ?? [])
    .filter((f) => isOurTeam(f, "Home") || isOurTeam(f, "Away"))
    .sort((a, b) => a.From.localeCompare(b.From));
}

function renderCard(f: Fixture): string {
  const { date, time } = formatFixtureWhen(f.From);
  const weAreHome = isOurTeam(f, "Home");
  const opponent = weAreHome
    ? `${f.AwayTeamName} (${f.AwayOrgName})`
    : `${f.HomeTeamName} (${f.HomeOrgName})`;
  const us = `${TEAM_NAME} (${CLUB_NAME})`;
  const mapUrl = `https://www.google.com/maps?q=${f.LocationLat},${f.LocationLng}`;
  return `
    <div class="card">
      <div class="date">${escapeHtml(date)}</div>
      <div class="time">${escapeHtml(time)}</div>
      <div class="match"><strong>${escapeHtml(us)}</strong> vs ${escapeHtml(opponent)}</div>
      <div class="venue">
        ${escapeHtml(f.VenueName)}<br>
        <a href="${escapeHtml(mapUrl)}" target="_blank" rel="noopener">Open in Google Maps &rarr;</a>
      </div>
      <div class="status">${escapeHtml(f.RoundName)} &middot; ${escapeHtml(f.StatusName)}</div>
    </div>`;
}

function renderPage(fixtures: Fixture[], errorMessage?: string): string {
  const cards = errorMessage
    ? `<div class="error">${escapeHtml(errorMessage)}</div>`
    : fixtures.length
      ? fixtures.map(renderCard).join("")
      : `<div class="empty">No fixtures scheduled.</div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Purple 10M Fixtures</title>
<style>
  :root {
    --purple: #6b21a8;
    --purple-light: #f3e8ff;
    --text: #1f2937;
    --muted: #6b7280;
    --border: #e5e7eb;
    --bg: #fafafa;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: var(--bg);
    color: var(--text);
    line-height: 1.4;
  }
  main { max-width: 600px; margin: 0 auto; padding: 16px; }
  header {
    padding: 12px 0 16px;
    border-bottom: 2px solid var(--purple);
    margin-bottom: 16px;
  }
  h1 { margin: 0; font-size: 1.5rem; color: var(--purple); }
  .sub { color: var(--muted); font-size: 0.875rem; margin-top: 4px; }
  .card {
    background: white;
    border: 1px solid var(--border);
    border-left: 4px solid var(--purple);
    border-radius: 8px;
    padding: 14px;
    margin-bottom: 12px;
  }
  .date {
    font-size: 0.875rem;
    color: var(--purple);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .time { font-size: 1.125rem; font-weight: 600; margin-top: 2px; }
  .match { margin: 10px 0; font-size: 1rem; }
  .match strong { color: var(--purple); }
  .venue { font-size: 0.9rem; color: var(--muted); margin-top: 6px; }
  .venue a { color: var(--purple); text-decoration: none; font-weight: 500; }
  .venue a:hover { text-decoration: underline; }
  .status {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 0.75rem;
    background: var(--purple-light);
    color: var(--purple);
    margin-top: 4px;
  }
  .empty, .error { text-align: center; padding: 32px 16px; color: var(--muted); }
  .error { color: #b91c1c; }
</style>
</head>
<body>
<main>
  <header>
    <h1>Purple 10M Fixtures</h1>
    <div class="sub">Ellerslie AFC &middot; NRF Mixed U10 Central</div>
  </header>
  ${cards}
</main>
</body>
</html>`;
}

export const handler = async (
  _event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
  const t = todayInNz();
  const from = ymd(t.y, t.m, t.d);
  const to = ymd(t.y, 12, 31);

  let html: string;
  let status = 200;
  try {
    const fixtures = await fetchFixtures(from, to);
    html = renderPage(fixtures);
  } catch (err) {
    status = 502;
    html = renderPage([], `Failed to load fixtures: ${String(err)}`);
  }

  return {
    statusCode: status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
    body: html,
  };
};
