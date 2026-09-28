"""Prepare an ABS CPI/WPI update from the latest official release workbooks.

The strict extractor validates the series in each downloaded workbook. This
script leaves the repository untouched when the underlying observations have
not changed, even if the monthly CPI page has a newer publication date.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import sys
import tempfile
import urllib.parse
import urllib.request
from datetime import date, datetime
from pathlib import Path

from extract_abs_snapshot import load_series


ROOT = Path(__file__).resolve().parents[1]
MANIFEST_PATH = ROOT / "data" / "source-manifest.json"
BASE = "https://www.abs.gov.au/statistics/economy/price-indexes-and-inflation/"
PUBLICATIONS = {
    "cpi": ("consumer-price-index-australia", 17, "Consumer Price Index, Australia"),
    "wpi": ("wage-price-index-australia", 1, "Wage Price Index, Australia"),
}
MONTHS = {
    "jan": "January", "feb": "February", "mar": "March", "apr": "April",
    "may": "May", "jun": "June", "jul": "July", "aug": "August",
    "sep": "September", "oct": "October", "nov": "November", "dec": "December",
}


def official_url(url: str, slug: str, *, workbook: bool = False) -> str:
    parsed = urllib.parse.urlparse(url)
    prefix = f"/statistics/economy/price-indexes-and-inflation/{slug}/"
    if parsed.scheme != "https" or parsed.netloc != "www.abs.gov.au" or not parsed.path.startswith(prefix):
        raise ValueError(f"Expected an official ABS {slug} URL: {url}")
    tail = parsed.path[len(prefix):]
    pattern = r"[a-z]{3}-\d{4}/[A-Za-z0-9_-]+\.xlsx" if workbook else r"[a-z]{3}-\d{4}"
    if not re.fullmatch(pattern, tail) or parsed.query or parsed.fragment:
        raise ValueError(f"Unexpected ABS release path: {url}")
    return url


def fetch(url: str, maximum: int) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": "EverydayEconomicsDataUpdater/1.0"})
    with urllib.request.urlopen(request, timeout=30) as response:
        final = urllib.parse.urlparse(response.geturl())
        if final.scheme != "https" or final.netloc != "www.abs.gov.au":
            raise ValueError(f"ABS download redirected outside abs.gov.au: {response.geturl()}")
        data = response.read(maximum + 1)
    if len(data) > maximum:
        raise ValueError(f"ABS response is larger than {maximum} bytes: {url}")
    return data


def latest_page(slug: str) -> str:
    html = fetch(BASE + slug, 2_000_000).decode("utf-8")
    match = re.search(
        r'id="block-views-block-topic-releases-listing-topic-latest-release-block".{0,1200}?<a href="([^"]+)"',
        html,
        flags=re.IGNORECASE | re.DOTALL,
    )
    if not match:
        raise ValueError(f"Could not find the latest ABS release for {slug}")
    return official_url(urllib.parse.urljoin("https://www.abs.gov.au", match.group(1)), slug)


def release_info(kind: str, supplied_page: str | None) -> tuple[str, str, str, bytes]:
    slug, table_number, title_prefix = PUBLICATIONS[kind]
    page = official_url(supplied_page, slug) if supplied_page else latest_page(slug)
    html = fetch(page, 3_000_000).decode("utf-8")
    heading = re.search(
        rf"<h4>\s*TABLE\s+{table_number}\.\s*[^<]+</h4>.{{0,1200}}?<a href=\"([^\"]+\.xlsx)\"",
        html,
        flags=re.IGNORECASE | re.DOTALL,
    )
    if not heading:
        raise ValueError(f"Table {table_number} workbook was not found on {page}")
    workbook_url = official_url(urllib.parse.urljoin(page, heading.group(1)), slug, workbook=True)
    release = re.search(
        r'<div class="field__label">Released</div>\s*<div class="field__item">\s*(\d{2}/\d{2}/\d{4})',
        html,
    )
    if not release:
        raise ValueError(f"Release date was not found on {page}")
    release_date = datetime.strptime(release.group(1), "%d/%m/%Y").date().isoformat()
    short_month, year = page.rstrip("/").rsplit("/", 1)[-1].split("-")
    title = f"{title_prefix}, {MONTHS[short_month]} {year}"
    workbook = fetch(workbook_url, 20_000_000)
    if workbook[:2] != b"PK":
        raise ValueError(f"ABS Table {table_number} is not an XLSX file: {workbook_url}")
    return page, release_date, title, workbook


def main() -> None:
    parser = argparse.ArgumentParser(description="Prepare an official ABS CPI/WPI data update")
    parser.add_argument("--cpi-page", help="Optional official CPI release page; latest release by default")
    parser.add_argument("--wpi-page", help="Optional official WPI release page; latest release by default")
    args = parser.parse_args()
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    if manifest["cpi"]["indexSeriesId"] != "A2325846C" or manifest["wpi"]["indexSeriesId"] != "A2603609J":
        raise ValueError("Unexpected ABS series IDs in manifest")

    candidates = {}
    with tempfile.TemporaryDirectory() as temporary:
        for kind in ("cpi", "wpi"):
            slug, table_number, _ = PUBLICATIONS[kind]
            page, release_date, publication, workbook = release_info(kind, getattr(args, f"{kind}_page"))
            digest = hashlib.sha256(workbook).hexdigest().upper()
            month_year = page.rstrip("/").rsplit("/", 1)[-1]
            relative_path = f"data/sources/abs-{kind}-table-{table_number}-{month_year}.xlsx"
            temporary_path = Path(temporary) / f"{kind}.xlsx"
            temporary_path.write_bytes(workbook)
            candidate_source = {
                **manifest[kind],
                "publication": publication,
                "releaseDate": release_date,
                "pageUrl": page,
                "workbook": str(temporary_path),
                "sha256": digest,
            }
            candidate_values = load_series(candidate_source)
            current_values = load_series(manifest[kind])
            candidates[kind] = {
                "changed": candidate_values != current_values,
                "source": candidate_source,
                "relative_path": relative_path,
                "workbook": workbook,
            }
            print(f"{kind.upper()} {publication}: {'changed' if candidates[kind]['changed'] else 'unchanged'}")

    if not any(candidate["changed"] for candidate in candidates.values()):
        print("No ABS index observations changed; the repository snapshot stays as it is.")
        return

    for kind, candidate in candidates.items():
        if not candidate["changed"]:
            continue
        destination = ROOT / candidate["relative_path"]
        destination.write_bytes(candidate["workbook"])
        source = {**candidate["source"], "workbook": candidate["relative_path"]}
        manifest[kind] = source
    manifest["preparedOn"] = date.today().isoformat()
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    subprocess.run(
        [sys.executable, str(ROOT / "tools" / "extract_abs_snapshot.py"), "--snapshot-date", manifest["preparedOn"]],
        cwd=ROOT,
        check=True,
    )
    print("ABS candidate snapshot prepared. Review both official workbooks and the resulting branch before merging.")


if __name__ == "__main__":
    main()
