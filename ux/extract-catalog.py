#!/usr/bin/env python3
"""Extract the nine metric tables from the USA Map Statistics Catalog DOCX."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from zipfile import ZipFile
from xml.etree import ElementTree as ET


W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
NS = {"w": W}

CATEGORIES = {
    "Demographics & migration": "People",
    "Income, housing & affordability": "Money & homes",
    "Education & work": "Work & education",
    "Crime & safety": "Safety",
    "Mortality, drugs & health": "Health",
    "Homelessness": "Homelessness",
    "Taxes & wealth": "Taxes & wealth",
    "Prices & consumer life": "Everyday prices",
    "Food environment, recreation & air": "Food & environment",
}

SOURCE_URLS = {
    "Census ACS": "https://www.census.gov/data/developers/data-sets/acs-5year.html",
    "FBI CDE": "https://cde.ucr.cjis.gov/",
    "CDC WONDER": "https://wonder.cdc.gov/",
    "FBI CDE / CDC WONDER": "https://cde.ucr.cjis.gov/ ; https://wonder.cdc.gov/",
    "HUD AHAR/PIT": "https://www.huduser.gov/portal/datasets/ahar.html",
    "BLS OEWS / LAUS": "https://www.bls.gov/oes/ ; https://www.bls.gov/lau/",
    "BEA RPP": "https://www.bea.gov/data/prices-inflation/regional-price-parities-state-and-metro-area",
    "IRS SOI": "https://www.irs.gov/statistics/soi-tax-stats-data-by-geographic-area",
    "USDA Food Environment Atlas": "https://www.ers.usda.gov/data-products/food-environment-atlas",
    "CDC PLACES": "https://www.cdc.gov/places/",
    "EPA AirData": "https://www.epa.gov/outdoor-air-quality-data",
    "EIA Electricity": "https://www.eia.gov/electricity/data.php",
    "Forbes Billionaires": "https://www.forbes.com/real-time-billionaires/",
}

UNAVAILABLE_SOURCE_PATTERNS = (
    "Millionaire estimate",
    "Forbes Billionaires",
    "Retail / menu",
    "Retail / fuel",
    "Consumer debt",
    "Health insurance",
)


def text(element: ET.Element) -> str:
    return "".join(node.text or "" for node in element.findall(".//w:t", NS))


def table_rows(table: ET.Element) -> list[list[str]]:
    return [
        [text(cell) for cell in row.findall("./w:tc", NS)]
        for row in table.findall("./w:tr", NS)
    ]


def slug(value: str) -> str:
    value = value.lower().replace("&", " and ")
    value = re.sub(r"['’]", "", value)
    value = re.sub(r"[^a-z0-9]+", "-", value).strip("-")
    return value


def explicit(coverage: str, geography: str) -> bool:
    return bool(re.search(rf"\b{re.escape(geography)}\b", coverage, flags=re.I))


def unit_hint(metric: str) -> str:
    if metric in {
        "Median household income",
        "Per-capita income",
        "Median rent",
        "Median home value",
        "Adjusted Gross Income (AGI)",
        "Average / mean salary",
    }:
        return "Currency"
    lower = metric.lower()
    if "%" in metric or "share" in lower or "rate" in lower:
        return "Source-defined rate"
    if "per 10k" in lower or "/per 10k" in lower:
        return "Per 10,000 residents"
    if "per capita" in lower:
        return "Per capita"
    return "Source-defined"


def availability(source: str) -> str:
    return "unavailable" if any(pattern in source for pattern in UNAVAILABLE_SOURCE_PATTERNS) else "demo"


def extract(source_path: Path) -> dict:
    with ZipFile(source_path) as archive:
        root = ET.fromstring(archive.read("word/document.xml"))

    children = list(root.find("w:body", NS))
    heading = None
    metrics = []
    metric_tables = 0
    for child in children:
        tag = child.tag.rsplit("}", 1)[-1]
        if tag == "p":
            paragraph = text(child).strip()
            if paragraph in CATEGORIES:
                heading = paragraph
        elif tag == "tbl":
            rows = table_rows(child)
            if not rows or rows[0] != ["Metric", "Recommended source", "Geography", "Notes"]:
                continue
            if heading is None:
                raise ValueError("metric table has no preceding category heading")
            metric_tables += 1
            for metric, source, coverage, notes in rows[1:]:
                metrics.append(
                    {
                        "id": slug(metric),
                        "name": metric,
                        "category": heading,
                        "shortCategory": CATEGORIES[heading],
                        "source": source,
                        "sourceUrl": (SOURCE_URLS.get(source) or "").split(" ; ")[0] or None,
                        "sourceUrls": (SOURCE_URLS.get(source) or "").split(" ; ") if SOURCE_URLS.get(source) else [],
                        "coverage": coverage,
                        "note": notes,
                        "availability": availability(source),
                        "countySupported": explicit(coverage, "county"),
                        "stateSupported": explicit(coverage, "state"),
                        "unitHint": unit_hint(metric),
                    }
                )

    ids = [metric["id"] for metric in metrics]
    if metric_tables != 9:
        raise ValueError(f"expected 9 metric tables, found {metric_tables}")
    if len(metrics) != 81:
        raise ValueError(f"expected 81 metrics, found {len(metrics)}")
    if len(set(ids)) != len(ids):
        raise ValueError("metric ids are not unique")
    if set(metric["shortCategory"] for metric in metrics) != set(CATEGORIES.values()):
        raise ValueError("unexpected category set")
    hud = [metric for metric in metrics if metric["source"] == "HUD AHAR/PIT"]
    if len(hud) != 6 or any(metric["countySupported"] for metric in hud):
        raise ValueError("HUD metrics must be six rows with countySupported=false")
    return {"source": source_path.name, "metricTables": metric_tables, "metrics": metrics}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("--output", type=Path, default=Path(__file__).with_name("catalog.json"))
    args = parser.parse_args()
    catalog = extract(args.source)
    args.output.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {args.output}: {len(catalog['metrics'])} metrics in {catalog['metricTables']} tables")


if __name__ == "__main__":
    main()
