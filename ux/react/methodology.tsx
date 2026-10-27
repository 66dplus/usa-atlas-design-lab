type Method = { id:string; name:string; source:string; url:string; additionalSources?:{label:string;url:string}[]; formula:string; unit:string; period:string; geography:string[]; universe:string; classification:'native'|'custom'; method:string; limitations:string[] };

// Audited against selection-registry.json and the frozen 2026-10-26 period implementation result.
export const methodologyRecords: Method[] = [
  {
    "id": "population",
    "name": "Population",
    "source": "Census ACS",
    "url": "https://api.census.gov/data/2024/acs/acs5/groups/B01003.html",
    "formula": "B01003_001E",
    "unit": "people",
    "period": "2020–2024",
    "geography": [
      "county",
      "state"
    ],
    "universe": "The ACS estimate counts residents at this place during the 2020–2024 survey period. It is a population count, not a population density or growth rate.",
    "classification": "native",
    "method": "Methodology provided by Census ACS. The ACS estimate counts residents at this place during the 2020–2024 survey period. It is a population count, not a population density or growth rate.",
    "limitations": []
  },
  {
    "id": "age",
    "name": "Median age",
    "source": "Census ACS",
    "url": "https://api.census.gov/data/2024/acs/acs5/groups/B01002.html",
    "formula": "B01002_001E",
    "unit": "years",
    "period": "2020–2024",
    "geography": [
      "county",
      "state"
    ],
    "universe": "The ACS estimates the age at the midpoint of the population at this place during 2020–2024. Half the population is younger than this age and half is older.",
    "classification": "native",
    "method": "Methodology provided by Census ACS. The ACS estimates the age at the midpoint of the population at this place during 2020–2024. Half the population is younger than this age and half is older.",
    "limitations": []
  },
  {
    "id": "sex",
    "name": "Men per 100 women",
    "source": "Census ACS",
    "url": "https://api.census.gov/data/2024/acs/acs5/groups/B01001.html",
    "formula": "B01001_002E / B01001_026E * 100",
    "unit": "men per 100 women",
    "period": "2020–2024",
    "geography": [
      "county",
      "state"
    ],
    "universe": "Men divided by women, multiplied by 100. Values below 100 mean fewer men than women.",
    "classification": "custom",
    "method": "Calculated by USA Maps. Men divided by women, multiplied by 100. Values below 100 mean fewer men than women.",
    "limitations": []
  },
  {
    "id": "race-ethnicity",
    "name": "Hispanic or Latino share",
    "source": "Census ACS",
    "url": "https://api.census.gov/data/2024/acs/acs5/groups/B03002.html",
    "formula": "B03002_012E / B03002_001E * 100",
    "unit": "%",
    "period": "2020–2024",
    "geography": [
      "county",
      "state"
    ],
    "universe": "Hispanic or Latino residents divided by all residents, multiplied by 100. This is the share of the total population that is Hispanic or Latino; Hispanic origin can be of any race.",
    "classification": "custom",
    "method": "Calculated by USA Maps. Hispanic or Latino residents divided by all residents, multiplied by 100. This is the share of the total population that is Hispanic or Latino; Hispanic origin can be of any race.",
    "limitations": [
      "Race and Hispanic-origin categories overlap; Hispanic origin can be of any race."
    ]
  },
  {
    "id": "race-ethnicity--asian",
    "name": "Asian non-Hispanic share",
    "source": "Census ACS",
    "url": "https://api.census.gov/data/2024/acs/acs5/groups/B03002.html",
    "formula": "B03002_006E / B03002_001E * 100",
    "unit": "%",
    "period": "2020–2024",
    "geography": [
      "county",
      "state"
    ],
    "universe": "People who are Asian alone and not Hispanic or Latino divided by all residents, multiplied by 100. This is the share of the total population in that category.",
    "classification": "custom",
    "method": "Calculated by USA Maps. People who are Asian alone and not Hispanic or Latino divided by all residents, multiplied by 100. This is the share of the total population in that category.",
    "limitations": [
      "Race and Hispanic-origin categories overlap; Hispanic origin can be of any race."
    ]
  },
  {
    "id": "race-ethnicity--black",
    "name": "Black non-Hispanic share",
    "source": "Census ACS",
    "url": "https://api.census.gov/data/2024/acs/acs5/groups/B03002.html",
    "formula": "B03002_004E / B03002_001E * 100",
    "unit": "%",
    "period": "2020–2024",
    "geography": [
      "county",
      "state"
    ],
    "universe": "People who are Black or African American alone and not Hispanic or Latino divided by all residents, multiplied by 100. This is the share of the total population in that category.",
    "classification": "custom",
    "method": "Calculated by USA Maps. People who are Black or African American alone and not Hispanic or Latino divided by all residents, multiplied by 100. This is the share of the total population in that category.",
    "limitations": [
      "Race and Hispanic-origin categories overlap; Hispanic origin can be of any race."
    ]
  },
  {
    "id": "race-ethnicity--white-non-hispanic",
    "name": "White non-Hispanic share",
    "source": "Census ACS",
    "url": "https://api.census.gov/data/2024/acs/acs5/groups/B03002.html",
    "formula": "B03002_003E / B03002_001E * 100",
    "unit": "%",
    "period": "2020–2024",
    "geography": [
      "county",
      "state"
    ],
    "universe": "People who are White alone and not Hispanic or Latino divided by all residents, multiplied by 100. This is the share of the total population in that category.",
    "classification": "custom",
    "method": "Calculated by USA Maps. People who are White alone and not Hispanic or Latino divided by all residents, multiplied by 100. This is the share of the total population in that category.",
    "limitations": [
      "Race and Hispanic-origin categories overlap; Hispanic origin can be of any race."
    ]
  },
  {
    "id": "foreign-born-population",
    "name": "Foreign-born share",
    "source": "Census ACS",
    "url": "https://api.census.gov/data/2024/acs/acs5/groups/B05002.html",
    "formula": "B05002_013E / B05002_001E * 100",
    "unit": "%",
    "period": "2020–2024",
    "geography": [
      "county",
      "state"
    ],
    "universe": "Residents born outside the United States divided by all residents, multiplied by 100. This is the share of the population that is foreign-born.",
    "classification": "custom",
    "method": "Calculated by USA Maps. Residents born outside the United States divided by all residents, multiplied by 100. This is the share of the population that is foreign-born.",
    "limitations": []
  },
  {
    "id": "citizenship",
    "name": "Share of residents who are not U.S. citizens",
    "source": "Census ACS",
    "url": "https://api.census.gov/data/2024/acs/acs5/groups/B05001.html",
    "formula": "B05001_006E / B05001_001E * 100",
    "unit": "%",
    "period": "2020–2024",
    "geography": [
      "county",
      "state"
    ],
    "universe": "Non-citizen residents divided by total residents, multiplied by 100.",
    "classification": "custom",
    "method": "Calculated by USA Maps. Non-citizen residents divided by total residents, multiplied by 100.",
    "limitations": []
  },
  {
    "id": "median-household-income",
    "name": "Median household income",
    "source": "Census ACS",
    "url": "https://api.census.gov/data/2024/acs/acs5/groups/B19013.html",
    "formula": "B19013_001E",
    "unit": "USD/year",
    "period": "2020–2024",
    "geography": [
      "county",
      "state"
    ],
    "universe": "The ACS estimates the midpoint of household incomes at this place over 2020–2024: half of households had a higher income and half had a lower income. This is a household measure, not income per person.",
    "classification": "native",
    "method": "Methodology provided by Census ACS. The ACS estimates the midpoint of household incomes at this place over 2020–2024: half of households had a higher income and half had a lower income. This is a household measure, not income per person.",
    "limitations": []
  },
  {
    "id": "per-capita-income",
    "name": "Average income per person",
    "source": "Census ACS",
    "url": "https://api.census.gov/data/2024/acs/acs5/groups/B19301.html",
    "formula": "B19301_001E",
    "unit": "USD/year",
    "period": "2020–2024",
    "geography": [
      "county",
      "state"
    ],
    "universe": "Total income in the past 12 months divided by the total population. This is the average dollar income per person, not a household income figure.",
    "classification": "native",
    "method": "Methodology provided by Census ACS. Total income in the past 12 months divided by the total population. This is the average dollar income per person, not a household income figure.",
    "limitations": []
  },
  {
    "id": "median-rent",
    "name": "Median monthly rent",
    "source": "Census ACS",
    "url": "https://api.census.gov/data/2024/acs/acs5/groups/B25064.html",
    "formula": "B25064_001E",
    "unit": "USD/month",
    "period": "2020–2024",
    "geography": [
      "county",
      "state"
    ],
    "universe": "The ACS estimates the midpoint of monthly gross rents for renter-occupied homes paying cash rent. Half of these rents are higher and half are lower.",
    "classification": "native",
    "method": "Methodology provided by Census ACS. The ACS estimates the midpoint of monthly gross rents for renter-occupied homes paying cash rent. Half of these rents are higher and half are lower.",
    "limitations": []
  },
  {
    "id": "median-home-value",
    "name": "Median home value",
    "source": "Census ACS",
    "url": "https://api.census.gov/data/2024/acs/acs5/groups/B25077.html",
    "formula": "B25077_001E",
    "unit": "USD",
    "period": "2020–2024",
    "geography": [
      "county",
      "state"
    ],
    "universe": "The ACS estimates the midpoint of reported home values for owner-occupied homes. Half of the estimated values are higher and half are lower.",
    "classification": "native",
    "method": "Methodology provided by Census ACS. The ACS estimates the midpoint of reported home values for owner-occupied homes. Half of the estimated values are higher and half are lower.",
    "limitations": []
  },
  {
    "id": "mortgage-selected-monthly-owner-costs",
    "name": "Median monthly owner costs",
    "source": "Census ACS",
    "url": "https://api.census.gov/data/2024/acs/acs5/groups/B25088.html",
    "formula": "B25088_001E",
    "unit": "USD/month",
    "period": "2020–2024",
    "geography": [
      "county",
      "state"
    ],
    "universe": "The ACS estimates selected monthly costs for owner-occupied homes, including housing expenses such as mortgage payments, taxes, insurance, utilities, and fuels. This is a housing-cost measure, not a home price.",
    "classification": "native",
    "method": "Methodology provided by Census ACS. The ACS estimates selected monthly costs for owner-occupied homes, including housing expenses such as mortgage payments, taxes, insurance, utilities, and fuels. This is a housing-cost measure, not a home price.",
    "limitations": []
  },
  {
    "id": "rent-as-of-income-rent-burden",
    "name": "Share of renters spending 30%+ of income on rent",
    "source": "Census ACS",
    "url": "https://api.census.gov/data/2024/acs/acs5/groups/B25070.html",
    "formula": "(B25070_007E+B25070_008E+B25070_009E+B25070_010E) / (B25070_001E-B25070_011E) * 100",
    "unit": "%",
    "period": "2020–2024",
    "geography": [
      "county",
      "state"
    ],
    "universe": "Renters spending 30 percent or more of household income on rent divided by renter households with a computable ratio, multiplied by 100.",
    "classification": "custom",
    "method": "Calculated by USA Maps. Renters spending 30 percent or more of household income on rent divided by renter households with a computable ratio, multiplied by 100.",
    "limitations": []
  },
  {
    "id": "owner-renter-ratio",
    "name": "Homeownership rate",
    "source": "Census ACS",
    "url": "https://api.census.gov/data/2024/acs/acs5/groups/B25003.html",
    "formula": "B25003_002E / (B25003_002E+B25003_003E) * 100",
    "unit": "%",
    "period": "2020–2024",
    "geography": [
      "county",
      "state"
    ],
    "universe": "Owner-occupied households divided by owner- and renter-occupied households, multiplied by 100.",
    "classification": "custom",
    "method": "Calculated by USA Maps. Owner-occupied households divided by owner- and renter-occupied households, multiplied by 100.",
    "limitations": []
  },
  {
    "id": "poverty",
    "name": "Poverty rate",
    "source": "Census ACS",
    "url": "https://api.census.gov/data/2024/acs/acs5/groups/B17001.html",
    "formula": "B17001_002E / B17001_001E * 100",
    "unit": "%",
    "period": "2020–2024",
    "geography": [
      "county",
      "state"
    ],
    "universe": "People whose income is below the Census poverty threshold divided by the population for whom poverty status is determined, multiplied by 100. It is the share of that population below the threshold; it is not a measure of how far below it their incomes are.",
    "classification": "custom",
    "method": "Calculated by USA Maps. People whose income is below the Census poverty threshold divided by the population for whom poverty status is determined, multiplied by 100. It is the share of that population below the threshold; it is not a measure of how far below it their incomes are.",
    "limitations": []
  },
  {
    "id": "households-earning-200k",
    "name": "Share of households earning $200,000+",
    "source": "Census ACS",
    "url": "https://api.census.gov/data/2024/acs/acs5/groups/B19001.html",
    "formula": "B19001_017E / B19001_001E * 100",
    "unit": "%",
    "period": "2020–2024",
    "geography": [
      "county",
      "state"
    ],
    "universe": "Households with income of $200,000 or more divided by all households, multiplied by 100.",
    "classification": "custom",
    "method": "Calculated by USA Maps. Households with income of $200,000 or more divided by all households, multiplied by 100.",
    "limitations": []
  },
  {
    "id": "cost-of-living-regional-price-parities",
    "name": "Cost of living index",
    "source": "BEA RPP",
    "url": "https://www.bea.gov/data/prices-inflation/regional-price-parities-state-and-metro-area",
    "formula": "02.10",
    "unit": "index (US=100)",
    "period": "2024 annual",
    "geography": [
      "state"
    ],
    "universe": "BEA Regional Price Parities. The US value is 100; values above 100 indicate a higher price level. State observations only; no county value is inferred.",
    "classification": "native",
    "method": "Methodology provided by BEA RPP. BEA Regional Price Parities. The US value is 100; values above 100 indicate a higher price level. State observations only; no county value is inferred.",
    "limitations": [
      "RPP is a state/metro price-level index with U.S.=100; it does not provide county values.",
      "State and metro price-level index with US=100; no county values. The index is not a household budget or local price for every item."
    ]
  },
  {
    "id": "bachelors-degree",
    "name": "Bachelor's degree rate",
    "source": "Census ACS",
    "url": "https://api.census.gov/data/2024/acs/acs5/groups/B15003.html",
    "formula": "B15003_022E / B15003_001E * 100",
    "unit": "%",
    "period": "2020–2024",
    "geography": [
      "county",
      "state"
    ],
    "universe": "Adults 25+ with a bachelor's degree divided by adults 25+, multiplied by 100.",
    "classification": "custom",
    "method": "Calculated by USA Maps. Adults 25+ with a bachelor's degree divided by adults 25+, multiplied by 100.",
    "limitations": []
  },
  {
    "id": "masters-degree",
    "name": "Master's degree rate",
    "source": "Census ACS",
    "url": "https://api.census.gov/data/2024/acs/acs5/groups/B15003.html",
    "formula": "B15003_023E / B15003_001E * 100",
    "unit": "%",
    "period": "2020–2024",
    "geography": [
      "county",
      "state"
    ],
    "universe": "Adults 25+ with a master's degree divided by adults 25+, multiplied by 100.",
    "classification": "custom",
    "method": "Calculated by USA Maps. Adults 25+ with a master's degree divided by adults 25+, multiplied by 100.",
    "limitations": []
  },
  {
    "id": "doctorate",
    "name": "Doctorate rate",
    "source": "Census ACS",
    "url": "https://api.census.gov/data/2024/acs/acs5/groups/B15003.html",
    "formula": "B15003_025E / B15003_001E * 100",
    "unit": "%",
    "period": "2020–2024",
    "geography": [
      "county",
      "state"
    ],
    "universe": "Adults 25+ with a doctorate divided by adults 25+, multiplied by 100.",
    "classification": "custom",
    "method": "Calculated by USA Maps. Adults 25+ with a doctorate divided by adults 25+, multiplied by 100.",
    "limitations": []
  },
  {
    "id": "high-school-attainment",
    "name": "High school attainment rate",
    "source": "Census ACS",
    "url": "https://api.census.gov/data/2024/acs/acs5/groups/B15003.html",
    "formula": "SUM(B15003_017E..B15003_025E) / B15003_001E * 100",
    "unit": "%",
    "period": "2020–2024",
    "geography": [
      "county",
      "state"
    ],
    "universe": "Adults 25+ with a high school diploma or higher divided by adults 25+, multiplied by 100.",
    "classification": "custom",
    "method": "Calculated by USA Maps. Adults 25+ with a high school diploma or higher divided by adults 25+, multiplied by 100.",
    "limitations": []
  },
  {
    "id": "no-diploma",
    "name": "No diploma rate",
    "source": "Census ACS",
    "url": "https://api.census.gov/data/2024/acs/acs5/groups/B15003.html",
    "formula": "SUM(B15003_002E..B15003_016E) / B15003_001E * 100",
    "unit": "%",
    "period": "2020–2024",
    "geography": [
      "county",
      "state"
    ],
    "universe": "Adults 25+ without a high school diploma divided by adults 25+, multiplied by 100.",
    "classification": "custom",
    "method": "Calculated by USA Maps. Adults 25+ without a high school diploma divided by adults 25+, multiplied by 100.",
    "limitations": []
  },
  {
    "id": "unemployment",
    "name": "Unemployment rate",
    "source": "BLS LAUS",
    "url": "https://www.bls.gov/lau/lauov.htm",
    "formula": "Official BLS LAUS measure 03; monthly M01–M12 and published annual M13. M13 is not a recomputed monthly average.",
    "unit": "%",
    "period": "2025-M01 through 2025-M12 plus official annual M13 where published",
    "geography": [
      "county",
      "state"
    ],
    "universe": "Official NSA BLS LAUS unemployment rate with published unemployed, employed, and labor-force count components.",
    "classification": "native",
    "method": "Methodology provided by BLS LAUS. Official NSA BLS LAUS unemployment rate with published unemployed, employed, and labor-force count components.",
    "limitations": [
      "Monthly 2025 October is missing. Annual M13 is the separately published annual series, not a monthly average. NSA series are used; seasonal-adjusted state series are not interchangeable."
    ]
  },
  {
    "id": "work-from-home-share",
    "name": "Share of workers working from home",
    "source": "Census ACS",
    "url": "https://api.census.gov/data/2024/acs/acs5/groups/B08301.html",
    "formula": "B08301_021E / B08301_001E * 100",
    "unit": "%",
    "period": "2020–2024",
    "geography": [
      "county",
      "state"
    ],
    "universe": "Workers age 16 and older who worked from home divided by all workers age 16 and older, multiplied by 100. It is the share of workers whose commute mode was working from home.",
    "classification": "custom",
    "method": "Calculated by USA Maps. Workers age 16 and older who worked from home divided by all workers age 16 and older, multiplied by 100. It is the share of workers whose commute mode was working from home.",
    "limitations": []
  },
  {
    "id": "murders",
    "name": "Murders",
    "source": "FBI SRS Estimated Crimes 1979-2025",
    "url": "https://cde-prd-data.s3.us-gov-east-1.amazonaws.com/additional-datasets/srs/estimated_crimes_1979_2025.csv",
    "formula": "annual rate = official FBI SRS annual count / same-row FBI population * 100000; source count and denominator retained",
    "unit": "per 100,000",
    "period": "2025 annual SRS estimate; revised rape definition for rape",
    "geography": [
      "state",
      "US"
    ],
    "universe": "Official FBI 2025 annual homicide estimate divided by the FBI population on the same state/national source row, multiplied by 100,000.",
    "classification": "custom",
    "method": "Calculated by USA Maps. Official FBI 2025 annual homicide estimate divided by the FBI population on the same state/national source row, multiplied by 100,000.",
    "limitations": [
      "The 2025 workbook is an annual SRS estimate; Florida and North Dakota have limited-data footnote 3. Rape uses the revised definition."
    ],
    "additionalSources": [
      {
        "label": "FBI Crime Data Explorer",
        "url": "https://cde.ucr.cjis.gov/"
      },
      {
        "label": "FBI 2025 reported-crime release",
        "url": "https://www.fbi.gov/news/press-releases/fbi-releases-2025-reported-crimes-in-the-nation-statistics"
      }
    ]
  },
  {
    "id": "violent-crime",
    "name": "Violent crime",
    "source": "FBI SRS Estimated Crimes 1979-2025",
    "url": "https://cde-prd-data.s3.us-gov-east-1.amazonaws.com/additional-datasets/srs/estimated_crimes_1979_2025.csv",
    "formula": "annual rate = official FBI SRS annual count / same-row FBI population * 100000; source count and denominator retained",
    "unit": "per 100,000",
    "period": "2025 annual SRS estimate; revised rape definition for rape",
    "geography": [
      "state",
      "US"
    ],
    "universe": "Official FBI 2025 annual violent_crime estimate divided by the FBI population on the same state/national source row, multiplied by 100,000.",
    "classification": "custom",
    "method": "Calculated by USA Maps. Official FBI 2025 annual violent_crime estimate divided by the FBI population on the same state/national source row, multiplied by 100,000.",
    "limitations": [
      "The 2025 workbook is an annual SRS estimate; Florida and North Dakota have limited-data footnote 3. Rape uses the revised definition."
    ],
    "additionalSources": [
      {
        "label": "FBI Crime Data Explorer",
        "url": "https://cde.ucr.cjis.gov/"
      },
      {
        "label": "FBI 2025 reported-crime release",
        "url": "https://www.fbi.gov/news/press-releases/fbi-releases-2025-reported-crimes-in-the-nation-statistics"
      }
    ]
  },
  {
    "id": "robbery",
    "name": "Robbery",
    "source": "FBI SRS Estimated Crimes 1979-2025",
    "url": "https://cde-prd-data.s3.us-gov-east-1.amazonaws.com/additional-datasets/srs/estimated_crimes_1979_2025.csv",
    "formula": "annual rate = official FBI SRS annual count / same-row FBI population * 100000; source count and denominator retained",
    "unit": "per 100,000",
    "period": "2025 annual SRS estimate; revised rape definition for rape",
    "geography": [
      "state",
      "US"
    ],
    "universe": "Official FBI 2025 annual robbery estimate divided by the FBI population on the same state/national source row, multiplied by 100,000.",
    "classification": "custom",
    "method": "Calculated by USA Maps. Official FBI 2025 annual robbery estimate divided by the FBI population on the same state/national source row, multiplied by 100,000.",
    "limitations": [
      "The 2025 workbook is an annual SRS estimate; Florida and North Dakota have limited-data footnote 3. Rape uses the revised definition."
    ],
    "additionalSources": [
      {
        "label": "FBI Crime Data Explorer",
        "url": "https://cde.ucr.cjis.gov/"
      },
      {
        "label": "FBI 2025 reported-crime release",
        "url": "https://www.fbi.gov/news/press-releases/fbi-releases-2025-reported-crimes-in-the-nation-statistics"
      }
    ]
  },
  {
    "id": "aggravated-assault",
    "name": "Aggravated assault",
    "source": "FBI SRS Estimated Crimes 1979-2025",
    "url": "https://cde-prd-data.s3.us-gov-east-1.amazonaws.com/additional-datasets/srs/estimated_crimes_1979_2025.csv",
    "formula": "annual rate = official FBI SRS annual count / same-row FBI population * 100000; source count and denominator retained",
    "unit": "per 100,000",
    "period": "2025 annual SRS estimate; revised rape definition for rape",
    "geography": [
      "state",
      "US"
    ],
    "universe": "Official FBI 2025 annual aggravated_assault estimate divided by the FBI population on the same state/national source row, multiplied by 100,000.",
    "classification": "custom",
    "method": "Calculated by USA Maps. Official FBI 2025 annual aggravated_assault estimate divided by the FBI population on the same state/national source row, multiplied by 100,000.",
    "limitations": [
      "The 2025 workbook is an annual SRS estimate; Florida and North Dakota have limited-data footnote 3. Rape uses the revised definition."
    ],
    "additionalSources": [
      {
        "label": "FBI Crime Data Explorer",
        "url": "https://cde.ucr.cjis.gov/"
      },
      {
        "label": "FBI 2025 reported-crime release",
        "url": "https://www.fbi.gov/news/press-releases/fbi-releases-2025-reported-crimes-in-the-nation-statistics"
      }
    ]
  },
  {
    "id": "burglary",
    "name": "Burglary",
    "source": "FBI SRS Estimated Crimes 1979-2025",
    "url": "https://cde-prd-data.s3.us-gov-east-1.amazonaws.com/additional-datasets/srs/estimated_crimes_1979_2025.csv",
    "formula": "annual rate = official FBI SRS annual count / same-row FBI population * 100000; source count and denominator retained",
    "unit": "per 100,000",
    "period": "2025 annual SRS estimate; revised rape definition for rape",
    "geography": [
      "state",
      "US"
    ],
    "universe": "Official FBI 2025 annual burglary estimate divided by the FBI population on the same state/national source row, multiplied by 100,000.",
    "classification": "custom",
    "method": "Calculated by USA Maps. Official FBI 2025 annual burglary estimate divided by the FBI population on the same state/national source row, multiplied by 100,000.",
    "limitations": [
      "The 2025 workbook is an annual SRS estimate; Florida and North Dakota have limited-data footnote 3. Rape uses the revised definition."
    ],
    "additionalSources": [
      {
        "label": "FBI Crime Data Explorer",
        "url": "https://cde.ucr.cjis.gov/"
      },
      {
        "label": "FBI 2025 reported-crime release",
        "url": "https://www.fbi.gov/news/press-releases/fbi-releases-2025-reported-crimes-in-the-nation-statistics"
      }
    ]
  },
  {
    "id": "motor-vehicle-theft",
    "name": "Motor vehicle theft",
    "source": "FBI SRS Estimated Crimes 1979-2025",
    "url": "https://cde-prd-data.s3.us-gov-east-1.amazonaws.com/additional-datasets/srs/estimated_crimes_1979_2025.csv",
    "formula": "annual rate = official FBI SRS annual count / same-row FBI population * 100000; source count and denominator retained",
    "unit": "per 100,000",
    "period": "2025 annual SRS estimate; revised rape definition for rape",
    "geography": [
      "state",
      "US"
    ],
    "universe": "Official FBI 2025 annual motor_vehicle_theft estimate divided by the FBI population on the same state/national source row, multiplied by 100,000.",
    "classification": "custom",
    "method": "Calculated by USA Maps. Official FBI 2025 annual motor_vehicle_theft estimate divided by the FBI population on the same state/national source row, multiplied by 100,000.",
    "limitations": [
      "The 2025 workbook is an annual SRS estimate; Florida and North Dakota have limited-data footnote 3. Rape uses the revised definition."
    ],
    "additionalSources": [
      {
        "label": "FBI Crime Data Explorer",
        "url": "https://cde.ucr.cjis.gov/"
      },
      {
        "label": "FBI 2025 reported-crime release",
        "url": "https://www.fbi.gov/news/press-releases/fbi-releases-2025-reported-crimes-in-the-nation-statistics"
      }
    ]
  },
  {
    "id": "rape",
    "name": "Rape",
    "source": "FBI SRS Estimated Crimes 1979-2025",
    "url": "https://cde-prd-data.s3.us-gov-east-1.amazonaws.com/additional-datasets/srs/estimated_crimes_1979_2025.csv",
    "formula": "annual rate = official FBI SRS annual count / same-row FBI population * 100000; source count and denominator retained",
    "unit": "per 100,000",
    "period": "2025 annual SRS estimate; revised rape definition for rape",
    "geography": [
      "state",
      "US"
    ],
    "universe": "Official FBI 2025 annual rape_revised estimate divided by the FBI population on the same state/national source row, multiplied by 100,000.",
    "classification": "custom",
    "method": "Calculated by USA Maps. Official FBI 2025 annual rape_revised estimate divided by the FBI population on the same state/national source row, multiplied by 100,000.",
    "limitations": [
      "The 2025 workbook is an annual SRS estimate; Florida and North Dakota have limited-data footnote 3. Rape uses the revised definition."
    ],
    "additionalSources": [
      {
        "label": "FBI Crime Data Explorer",
        "url": "https://cde.ucr.cjis.gov/"
      },
      {
        "label": "FBI 2025 reported-crime release",
        "url": "https://www.fbi.gov/news/press-releases/fbi-releases-2025-reported-crimes-in-the-nation-statistics"
      }
    ]
  },
  {
    "id": "obesity-rate",
    "name": "Obesity among adults",
    "source": "CDC PLACES",
    "url": "https://data.cdc.gov/500-Cities-Places/PLACES-Local-Data-for-Better-Health-County-Data-20/swc5-untb",
    "formula": "Published 2025 PLACES estimate where measureid=OBESITY and data_value_type=Age-adjusted prevalence.",
    "unit": "%",
    "period": "2023 BRFSS estimates, PLACES December 2025 release",
    "geography": [
      "county"
    ],
    "universe": "Adults aged 18 years and older with BMI ≥30.0 kg/m², calculated from self-reported height and weight.",
    "classification": "native",
    "method": "Methodology provided by CDC PLACES. County prevalence is modeled from BRFSS and Census/ACS inputs using multilevel regression and poststratification.",
    "limitations": [
      "Modeled county estimates, not direct county survey results. Estimates for Kentucky and Pennsylvania are unavailable for these 2023 BRFSS measures.",
      "CDC excludes self-reported heights below 3 ft or at least 8 ft, weights below 50 lb or at least 650 lb, and BMI below 12 or at least 100 kg/m²."
    ],
    "additionalSources": [
      {
        "label": "CDC PLACES measure definition",
        "url": "https://www.cdc.gov/places/measure-definitions/health-outcomes.html"
      },
      {
        "label": "CDC PLACES methodology",
        "url": "https://www.cdc.gov/places/methodology/index.html"
      },
      {
        "label": "CDC county dataset API (source estimate type metadata)",
        "url": "https://data.cdc.gov/resource/swc5-untb.json"
      }
    ]
  },
  {
    "id": "diabetes-rate",
    "name": "Diagnosed diabetes among adults",
    "source": "CDC PLACES",
    "url": "https://data.cdc.gov/500-Cities-Places/PLACES-Local-Data-for-Better-Health-County-Data-20/swc5-untb",
    "formula": "Published 2025 PLACES estimate where measureid=DIABETES and data_value_type=Age-adjusted prevalence.",
    "unit": "%",
    "period": "2023 BRFSS estimates, PLACES December 2025 release",
    "geography": [
      "county"
    ],
    "universe": "Adults aged 18 years and older who report that a health professional told them they have diabetes; gestational diabetes alone is excluded.",
    "classification": "native",
    "method": "Methodology provided by CDC PLACES. County prevalence is modeled from BRFSS and Census/ACS inputs using multilevel regression and poststratification.",
    "limitations": [
      "Modeled county estimates, not direct county survey results. Estimates for Kentucky and Pennsylvania are unavailable for these 2023 BRFSS measures.",
      "This is diagnosed diabetes; undiagnosed diabetes is not counted."
    ],
    "additionalSources": [
      {
        "label": "CDC PLACES measure definition",
        "url": "https://www.cdc.gov/places/measure-definitions/health-outcomes.html"
      },
      {
        "label": "CDC PLACES methodology",
        "url": "https://www.cdc.gov/places/methodology/index.html"
      },
      {
        "label": "CDC county dataset API (source estimate type metadata)",
        "url": "https://data.cdc.gov/resource/swc5-untb.json"
      }
    ]
  },
  {
    "id": "physical-inactivity-rate",
    "name": "No leisure-time physical activity among adults",
    "source": "CDC PLACES",
    "url": "https://data.cdc.gov/500-Cities-Places/PLACES-Local-Data-for-Better-Health-County-Data-20/swc5-untb",
    "formula": "Published 2025 PLACES estimate where measureid=LPA and data_value_type=Age-adjusted prevalence.",
    "unit": "%",
    "period": "2023 BRFSS estimates, PLACES December 2025 release",
    "geography": [
      "county"
    ],
    "universe": "Adults aged 18 years and older who report no physical activity or exercise other than their regular job during the past month. Occupational activity is excluded.",
    "classification": "native",
    "method": "Methodology provided by CDC PLACES. County prevalence is modeled from BRFSS and Census/ACS inputs using multilevel regression and poststratification.",
    "limitations": [
      "Modeled county estimates, not direct county survey results. Estimates for Kentucky and Pennsylvania are unavailable for these 2023 BRFSS measures."
    ],
    "additionalSources": [
      {
        "label": "CDC PLACES measure definition",
        "url": "https://www.cdc.gov/places/measure-definitions/health-risk-behaviors.html"
      },
      {
        "label": "CDC PLACES methodology",
        "url": "https://www.cdc.gov/places/methodology/index.html"
      },
      {
        "label": "CDC county dataset API (source estimate type metadata)",
        "url": "https://data.cdc.gov/resource/swc5-untb.json"
      }
    ]
  },
  {
    "id": "adjusted-gross-income-agi",
    "name": "Income before deductions",
    "source": "IRS SOI",
    "url": "https://www.irs.gov/pub/irs-soi/23incyallagi.csv",
    "formula": "Sum county A00100 (AGI stubs 1–8) × 1,000 USD; exclude state summary rows.",
    "unit": "USD",
    "period": "2023 tax year; matched-year population denominator for per-resident mode",
    "geography": [
      "county",
      "state",
      "nation"
    ],
    "universe": "IRS SOI tax-year 2023 A00100 adjusted gross income, summed over AGI stubs 1–8 and converted from thousand USD to USD. State and U.S. values aggregate county records while excluding state summary rows; they are calculated aggregates, not native IRS national observations.",
    "classification": "custom",
    "method": "Calculated by USA Maps. IRS SOI tax-year 2023 A00100 adjusted gross income, summed over AGI stubs 1–8 and converted from thousand USD to USD. State and U.S. values aggregate county records while excluding state summary rows; they are calculated aggregates, not native IRS national observations.",
    "limitations": [
      "A00100 is in thousand USD and is multiplied by 1,000. State and U.S. totals sum county stubs 1–8; county FIPS 000 state summary rows are excluded. The U.S. result is not a native IRS total."
    ],
    "additionalSources": [
      {
        "label": "Census PEP Vintage 2025 population estimates",
        "url": "https://www.census.gov/data/tables/time-series/demo/popest/2020s-counties-total.html"
      }
    ]
  },
  {
    "id": "electricity-price",
    "name": "Average electricity price",
    "source": "EIA Electricity",
    "url": "https://www.eia.gov/electricity/annual/table.php?t=epa_02_10.html",
    "formula": "EIA annual source price, ALL sectors",
    "unit": "cents/kWh",
    "period": "2025 calendar year; annual average, ALL sectors",
    "geography": [
      "state"
    ],
    "universe": "EIA state average electricity price for all sectors. State observations only; no county value is inferred.",
    "classification": "native",
    "method": "Methodology provided by EIA Electricity. EIA state average electricity price for all sectors. State observations only; no county value is inferred.",
    "limitations": [
      "Average retail price is cents per kWh, not an exclusively residential tariff or a monthly charge.",
      "ALL sectors annual average is not a residential-only tariff.",
      "Average retail price in cents/kWh for ALL sectors; not a residential-only tariff. State only; no county or US value inferred."
    ]
  },
  {
    "id": "all-cancer-new-cases",
    "name": "New cancer cases per 100,000 residents",
    "source": "CDC USCS + Census PEP Vintage 2025",
    "url": "https://gis.cdc.gov/Cancer/USCS/",
    "formula": "2023 incident cases ÷ 2023 annual PEP total population × 100,000",
    "unit": "per 100,000",
    "period": "2023 diagnosis year; crude rate",
    "geography": [
      "state",
      "US"
    ],
    "universe": "2023 incident cancer cases divided by matching-year 2023 Census PEP total population, multiplied by 100,000. This is a custom crude rate, not age-adjusted. A verified native U.S. case count supports the national value; no county rate is inferred.",
    "classification": "custom",
    "method": "Calculated by USA Maps. 2023 incident cancer cases divided by matching-year 2023 Census PEP total population, multiplied by 100,000. This is a custom crude rate, not age-adjusted. A verified native U.S. case count supports the national value; no county rate is inferred.",
    "limitations": [
      "State rates use state case counts; the U.S. rate uses the native U.S. case count. Suppressed or absent counts remain missing; state rates are not summed. This crude rate is not age-adjusted."
    ],
    "additionalSources": [
      {
        "label": "Census PEP Vintage 2025 population estimates",
        "url": "https://www.census.gov/data/tables/time-series/demo/popest/2020s-counties-total.html"
      },
      {
        "label": "Census PEP Vintage 2025 county totals file",
        "url": "https://www2.census.gov/programs-surveys/popest/datasets/2020-2025/counties/totals/co-est2025-alldata.csv"
      },
      {
        "label": "Census PEP Vintage 2025 national file; 2023 SEX=0, AGE=999 total-population row",
        "url": "https://www2.census.gov/programs-surveys/popest/datasets/2020-2025/national/asrh/nc-est2025-agesex-res.csv"
      }
    ]
  },
  {
    "id": "new-hiv-diagnoses",
    "name": "New HIV diagnoses per 100,000 residents",
    "source": "CDC HIV surveillance / NHSS",
    "url": "https://www.cdc.gov/hiv-data/nhss/hiv-diagnoses-deaths-prevalence.html",
    "formula": "2024 provisional diagnoses, age 13+ ÷ 2024 annual PEP age 13+ population × 100,000",
    "unit": "per 100,000",
    "period": "2024 provisional diagnoses (reported through December 2025); age 13+",
    "geography": [
      "state (U.S. value unavailable)"
    ],
    "universe": "2024 provisional diagnoses among people aged 13+ divided by matching-year 2024 Census PEP population aged 13+, multiplied by 100,000. This is a custom crude rate, not age-adjusted. Retained numerator inputs are state-only, so U.S. and county values remain missing.",
    "classification": "custom",
    "method": "Calculated by USA Maps. 2024 provisional diagnoses among people aged 13+ divided by matching-year 2024 Census PEP population aged 13+, multiplied by 100,000. This is a custom crude rate, not age-adjusted. Retained numerator inputs are state-only, so U.S. and county values remain missing.",
    "limitations": [
      "2024 provisional age-13+ diagnoses are reported through December 2025. Numerator observations are state-only; U.S. and county rates remain missing. Crude rate, not age-adjusted."
    ],
    "additionalSources": [
      {
        "label": "Census PEP county 2024 total population",
        "url": "https://www2.census.gov/programs-surveys/popest/datasets/2020-2025/counties/totals/co-est2025-alldata.csv"
      },
      {
        "label": "Census PEP 2024 county age/sex estimates",
        "url": "https://www2.census.gov/programs-surveys/popest/datasets/2020-2025/counties/asrh/cc-est2025-syasex.csv"
      },
      {
        "label": "Census PEP 2024 national age/sex estimates",
        "url": "https://www2.census.gov/programs-surveys/popest/datasets/2020-2025/national/asrh/nc-est2025-agesex-res.csv"
      },
      {
        "label": "CDC AtlasPlus publisher API endpoint (producer provenance)",
        "url": "https://gis.cdc.gov/api/AtlasPlus/qtOutputData"
      }
    ]
  },
  {
    "id": "deaths-under-18",
    "name": "Deaths among children under 18 per 100,000 children",
    "source": "CDC WONDER/NVSS; Census PEP Vintage 2025 denominator",
    "url": "https://wonder.cdc.gov/controller/saved/D158/D473F417",
    "formula": "2024 resident deaths, ages 0–17 ÷ July 1, 2024 annual PEP population, ages 0–17 × 100,000",
    "unit": "per 100,000",
    "period": "2024 final resident deaths; ages 0–17",
    "geography": [
      "state (U.S. value unavailable)"
    ],
    "universe": "2024 resident deaths at ages 0–17 divided by matching-year 2024 Census PEP population aged 0–17, multiplied by 100,000. Suppressed counts remain missing. Retained numerator inputs are state-only, so U.S. and county values remain missing.",
    "classification": "custom",
    "method": "Calculated by USA Maps. 2024 resident deaths at ages 0–17 divided by matching-year 2024 Census PEP population aged 0–17, multiplied by 100,000. Suppressed counts remain missing. Retained numerator inputs are state-only, so U.S. and county values remain missing.",
    "limitations": [
      "Suppressed mortality counts remain missing. Numerator observations are state-only; U.S. and county rates remain missing. Crude rate, not age-adjusted."
    ],
    "additionalSources": [
      {
        "label": "Census PEP county 2024 total population",
        "url": "https://www2.census.gov/programs-surveys/popest/datasets/2020-2025/counties/totals/co-est2025-alldata.csv"
      },
      {
        "label": "Census PEP 2024 county age/sex estimates",
        "url": "https://www2.census.gov/programs-surveys/popest/datasets/2020-2025/counties/asrh/cc-est2025-syasex.csv"
      },
      {
        "label": "Census PEP 2024 national age/sex estimates",
        "url": "https://www2.census.gov/programs-surveys/popest/datasets/2020-2025/national/asrh/nc-est2025-agesex-res.csv"
      }
    ]
  },
  {
    "id": "race-ethnicity--aian",
    "name": "American Indian and Alaska Native share",
    "source": "Census ACS 2024 five-year",
    "url": "https://api.census.gov/data/2024/acs/acs5/groups/B02010.html",
    "formula": "B02010_001E / B01003_001E × 100",
    "unit": "%",
    "period": "2020–2024",
    "geography": [
      "nation",
      "state",
      "county"
    ],
    "universe": "American Indian and Alaska Native alone or in combination; all Hispanic origins. This category can overlap other race categories.",
    "classification": "custom",
    "method": "Calculated by USA Maps. American Indian and Alaska Native alone or in combination; all Hispanic origins. This category can overlap other race categories.",
    "limitations": [
      "Alone-or-in-combination includes all Hispanic origins and overlaps other race categories; shares do not sum to 100%. Source estimate MOE is retained; no share MOE is inferred."
    ],
    "additionalSources": [
      {
        "label": "Census ACS total population table B01003",
        "url": "https://api.census.gov/data/2024/acs/acs5/groups/B01003.html"
      }
    ]
  },
  {
    "id": "elections-president",
    "name": "President election",
    "source": "MIT Election Data and Science Lab, Harvard Dataverse",
    "url": "https://doi.org/10.7910/DVN/VOQCHQ",
    "formula": "Selected party votes ÷ validated TOTAL contest votes × 100",
    "unit": "%",
    "period": "2024 election cycle; source history 2000–2024; interface starts at 2024",
    "geography": [
      "county"
    ],
    "universe": "Selected party vote share in the source-native 2024 contest.",
    "classification": "custom",
    "method": "Calculated by USA Maps. Selected party vote share in the source-native 2024 contest.",
    "limitations": [
      "2024 is initially selected; history spans 2000–2024. Missing, invalid, or unmatched geography remains missing."
    ],
    "additionalSources": [
      {
        "label": "Harvard Dataverse dataset version",
        "url": "https://dataverse.harvard.edu/dataset.xhtml?persistentId=doi:10.7910/DVN/VOQCHQ"
      }
    ]
  },
  {
    "id": "elections-senate",
    "name": "Senate election",
    "source": "MIT Election Data and Science Lab, Harvard Dataverse",
    "url": "https://doi.org/10.7910/DVN/PEJ5QU",
    "formula": "Selected party votes ÷ validated TOTAL contest votes × 100",
    "unit": "%",
    "period": "2024 regular-election cycle; source history 1976–2024; interface starts at 2024",
    "geography": [
      "state"
    ],
    "universe": "Selected party vote share in the source-native 2024 contest.",
    "classification": "custom",
    "method": "Calculated by USA Maps. Selected party vote share in the source-native 2024 contest.",
    "limitations": [
      "Regular elections only; no-election states are not zero-vote contests. History spans 1976–2024."
    ],
    "additionalSources": [
      {
        "label": "Harvard Dataverse dataset version",
        "url": "https://dataverse.harvard.edu/dataset.xhtml?persistentId=doi:10.7910/DVN/PEJ5QU"
      }
    ]
  },
  {
    "id": "elections-house",
    "name": "House election",
    "source": "MIT Election Data and Science Lab, Harvard Dataverse",
    "url": "https://doi.org/10.7910/DVN/IG0UN2",
    "formula": "Selected party votes ÷ validated TOTAL contest votes × 100",
    "unit": "%",
    "period": "2024 election cycle; source history 1976–2024; interface starts at 2024",
    "geography": [
      "2024 congressional district geometry (derived GeoJSON)"
    ],
    "universe": "Selected party vote share in the source-native 2024 contest.",
    "classification": "custom",
    "method": "Calculated by USA Maps. Selected party vote share in the source-native 2024 contest.",
    "limitations": [
      "2024 contests are matched to 119th Congress district boundaries; votes are not allocated to modern counties. History spans 1976–2024."
    ],
    "additionalSources": [
      {
        "label": "Harvard Dataverse dataset version",
        "url": "https://dataverse.harvard.edu/dataset.xhtml?persistentId=doi:10.7910/DVN/IG0UN2"
      },
      {
        "label": "Census 2024 Cartographic Boundary shapefile ZIP, 1:500,000, CD119",
        "url": "https://www2.census.gov/geo/tiger/GENZ2024/shp/cb_2024_us_cd119_500k.zip"
      }
    ]
  },
  {
    "id": "adjusted-gross-income-agi--per-resident",
    "name": "Income before deductions per resident",
    "source": "IRS Statistics of Income + Census Population Estimates Program (Vintage 2025)",
    "url": "https://www.irs.gov/pub/irs-soi/23incyallagi.csv",
    "formula": "Sum county A00100 (AGI stubs 1–8) × 1,000 USD ÷ 2023 annual PEP total population",
    "unit": "USD per resident",
    "period": "2023 tax year and July 1, 2023 population estimate",
    "geography": [
      "county",
      "state",
      "US"
    ],
    "universe": "IRS county AGI totals; state and US numerators are sums of county A00100 stubs 1–8, excluding state summary rows. Denominator is Census PEP Vintage 2025 total population for the same 2023 calendar year.",
    "classification": "custom",
    "method": "Calculated by USA Maps. Convert 2023 IRS county A00100 from thousand USD to USD, sum county stub rows 1–8 for the area, then divide by matching-year 2023 annual PEP total population.",
    "limitations": [
      "Separate income mode of the selectable IRS indicator; not an additional primary selection. It is income per resident, not household income.",
      "US total is derived by summing county rows and is not a native IRS US total. Missing geography remains missing; state summary rows are excluded."
    ],
    "additionalSources": [
      {
        "label": "Census PEP Vintage 2025 county totals file",
        "url": "https://www2.census.gov/programs-surveys/popest/datasets/2020-2025/counties/totals/co-est2025-alldata.csv"
      },
      {
        "label": "Census PEP Vintage 2025 national file; 2023 SEX=0, AGE=999 total-population row",
        "url": "https://www2.census.gov/programs-surveys/popest/datasets/2020-2025/national/asrh/nc-est2025-agesex-res.csv"
      }
    ]
  },
  {
    "id": "fitness-recreation-centers-per-capita",
    "name": "Recreation and fitness facilities per 1,000 residents (retained, hidden)",
    "source": "USDA Food Environment Atlas",
    "url": "https://www.ers.usda.gov/data-products/food-environment-atlas/data-access-and-documentation-downloads",
    "formula": "Published USDA field 09.04: cbp_fitness_per1000_published",
    "unit": "per 1,000 residents",
    "period": "2023 published field",
    "geography": [
      "county"
    ],
    "universe": "Published county rate; no denominator is recomputed in this application.",
    "classification": "native",
    "method": "Methodology provided by USDA Food Environment Atlas. The published 2023 rate is retained as hidden data; this indicator is not currently selectable.",
    "limitations": [
      "County observations only; no state or US value is inferred.",
      "A newer suitable USDA Atlas field-year was not verified in the 2026-10-26 audit. Retained data remains hidden."
    ]
  }
];

export const methodologyGroups = [["Demographics, housing, income, education and work", ["population", "age", "sex", "race-ethnicity", "race-ethnicity--white-non-hispanic", "race-ethnicity--black", "race-ethnicity--asian", "race-ethnicity--aian", "foreign-born-population", "citizenship", "median-household-income", "per-capita-income", "median-rent", "median-home-value", "mortgage-selected-monthly-owner-costs", "rent-as-of-income-rent-burden", "owner-renter-ratio", "poverty", "households-earning-200k", "bachelors-degree", "masters-degree", "doctorate", "high-school-attainment", "no-diploma", "work-from-home-share", "adjusted-gross-income-agi", "adjusted-gross-income-agi--per-resident"]], ["Economy", ["cost-of-living-regional-price-parities", "electricity-price"]], ["Employment", ["unemployment"]], ["Public safety", ["murders", "violent-crime", "robbery", "aggravated-assault", "burglary", "motor-vehicle-theft", "rape"]], ["Health", ["obesity-rate", "diabetes-rate", "physical-inactivity-rate", "all-cancer-new-cases", "new-hiv-diagnoses", "deaths-under-18"]], ["Elections", ["elections-president", "elections-senate", "elections-house"]]] as const;
function Record({item}:{item:Method}) { return <article className="methodology-record" id={'method-'+item.id}><h3>{item.name}</h3><dl><dt>Source</dt><dd><a href={item.url} target="_blank" rel="noreferrer">{item.source} ↗</a>{item.additionalSources?.map(source=><span key={source.url}> · <a href={source.url} target="_blank" rel="noreferrer">{source.label} ↗</a></span>)}</dd><dt>Method</dt><dd>{item.method}</dd><dt>Formula</dt><dd><code>{item.formula}</code></dd><dt>Unit</dt><dd>{item.unit}</dd><dt>Universe</dt><dd>{item.universe}</dd><dt>Period</dt><dd>{item.period}</dd><dt>Geography</dt><dd>{item.geography.join(', ')}</dd><dt>Limitations</dt><dd>{item.limitations.join(' ')}</dd></dl></article>; }
export function Methodology() { const byId=new Map(methodologyRecords.map(item=>[item.id,item])); return <section className="about-story-row methodology" aria-labelledby="methodology-title"><h2 id="methodology-title">Data &amp; methodology</h2><div className="methodology-content"><p className="methodology-intro">Each indicator lists its source, calculation, unit, population or record universe, period, geography, and known gaps. A missing value means no usable value is available in the admitted reader for that indicator, place, and period; it is never changed to zero or filled by adding state values. Published AIAN numerator and denominator margins of error are retained; no margin of error is calculated for the derived share. Suppressed or unavailable values remain missing.</p><p className="methodology-intro">“Methodology provided by” identifies a measure and formula published by its source. “Calculated by USA Maps” identifies a rate or share derived here from source fields.</p>{methodologyGroups.map(([title,ids])=><details className="methodology-group" key={title}><summary>{title}<span>{ids.length} {ids.length === 1 ? 'entry' : 'entries'}</span></summary><div className="methodology-list">{ids.map(id=>{const item=byId.get(id);return item?<Record key={id} item={item}/>:null})}</div></details>)}<details className="methodology-group methodology-retained"><summary>Retained but hidden data<span>1 entry</span></summary><div className="methodology-list"><Record item={byId.get('fitness-recreation-centers-per-capita')!}/></div></details><p className="methodology-note"><strong>Unemployment:</strong> monthly 2025 observations and the separately published annual M13 value are distinct views; October 2025 is missing. Election cycle and geography limits appear with each election record. House geography is a derived GeoJSON converted from the linked Census Cartographic Boundary shapefile ZIP; Census publishes the ZIP, not this derived GeoJSON.</p></div></section>; }
