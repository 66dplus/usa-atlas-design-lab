import './methodology.css';

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
    "limitations": [
      "ACS estimates are subject to sampling error; source estimate margins of error are retained. No margin of error is invented for a derived ratio.",
      "The survey period is 2020–2024; the estimate is not a point-in-time 2024 count."
    ]
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
    "limitations": [
      "ACS estimates are subject to sampling error; source estimate margins of error are retained. No margin of error is invented for a derived ratio.",
      "The survey period is 2020–2024; the estimate is not a point-in-time 2024 count."
    ]
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
    "limitations": [
      "ACS estimates are subject to sampling error; source estimate margins of error are retained. No margin of error is invented for a derived ratio.",
      "The survey period is 2020–2024; the estimate is not a point-in-time 2024 count."
    ]
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
      "ACS estimates are subject to sampling error; source estimate margins of error are retained. No margin of error is invented for a derived ratio.",
      "The survey period is 2020–2024; the estimate is not a point-in-time 2024 count.",
      "Race and Hispanic-origin views are alternatives, not additive shares; Hispanic or Latino origin can be of any race."
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
      "ACS estimates are subject to sampling error; source estimate margins of error are retained. No margin of error is invented for a derived ratio.",
      "The survey period is 2020–2024; the estimate is not a point-in-time 2024 count.",
      "Race and Hispanic-origin views are alternatives, not additive shares; Hispanic or Latino origin can be of any race."
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
      "ACS estimates are subject to sampling error; source estimate margins of error are retained. No margin of error is invented for a derived ratio.",
      "The survey period is 2020–2024; the estimate is not a point-in-time 2024 count.",
      "Race and Hispanic-origin views are alternatives, not additive shares; Hispanic or Latino origin can be of any race."
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
      "ACS estimates are subject to sampling error; source estimate margins of error are retained. No margin of error is invented for a derived ratio.",
      "The survey period is 2020–2024; the estimate is not a point-in-time 2024 count.",
      "Race and Hispanic-origin views are alternatives, not additive shares; Hispanic or Latino origin can be of any race."
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
    "limitations": [
      "ACS estimates are subject to sampling error; source estimate margins of error are retained. No margin of error is invented for a derived ratio.",
      "The survey period is 2020–2024; the estimate is not a point-in-time 2024 count."
    ]
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
    "limitations": [
      "ACS estimates are subject to sampling error; source estimate margins of error are retained. No margin of error is invented for a derived ratio.",
      "The survey period is 2020–2024; the estimate is not a point-in-time 2024 count."
    ]
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
    "limitations": [
      "ACS estimates are subject to sampling error; source estimate margins of error are retained. No margin of error is invented for a derived ratio.",
      "The survey period is 2020–2024; the estimate is not a point-in-time 2024 count."
    ]
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
    "limitations": [
      "ACS estimates are subject to sampling error; source estimate margins of error are retained. No margin of error is invented for a derived ratio.",
      "The survey period is 2020–2024; the estimate is not a point-in-time 2024 count."
    ]
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
    "limitations": [
      "ACS estimates are subject to sampling error; source estimate margins of error are retained. No margin of error is invented for a derived ratio.",
      "The survey period is 2020–2024; the estimate is not a point-in-time 2024 count."
    ]
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
    "limitations": [
      "ACS estimates are subject to sampling error; source estimate margins of error are retained. No margin of error is invented for a derived ratio.",
      "The survey period is 2020–2024; the estimate is not a point-in-time 2024 count."
    ]
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
    "limitations": [
      "ACS estimates are subject to sampling error; source estimate margins of error are retained. No margin of error is invented for a derived ratio.",
      "The survey period is 2020–2024; the estimate is not a point-in-time 2024 count."
    ]
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
    "limitations": [
      "ACS estimates are subject to sampling error; source estimate margins of error are retained. No margin of error is invented for a derived ratio.",
      "The survey period is 2020–2024; the estimate is not a point-in-time 2024 count."
    ]
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
    "limitations": [
      "ACS estimates are subject to sampling error; source estimate margins of error are retained. No margin of error is invented for a derived ratio.",
      "The survey period is 2020–2024; the estimate is not a point-in-time 2024 count."
    ]
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
    "limitations": [
      "ACS estimates are subject to sampling error; source estimate margins of error are retained. No margin of error is invented for a derived ratio.",
      "The survey period is 2020–2024; the estimate is not a point-in-time 2024 count."
    ]
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
    "limitations": [
      "ACS estimates are subject to sampling error; source estimate margins of error are retained. No margin of error is invented for a derived ratio.",
      "The survey period is 2020–2024; the estimate is not a point-in-time 2024 count."
    ]
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
    "limitations": [
      "ACS estimates are subject to sampling error; source estimate margins of error are retained. No margin of error is invented for a derived ratio.",
      "The survey period is 2020–2024; the estimate is not a point-in-time 2024 count."
    ]
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
    "limitations": [
      "ACS estimates are subject to sampling error; source estimate margins of error are retained. No margin of error is invented for a derived ratio.",
      "The survey period is 2020–2024; the estimate is not a point-in-time 2024 count."
    ]
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
    "limitations": [
      "ACS estimates are subject to sampling error; source estimate margins of error are retained. No margin of error is invented for a derived ratio.",
      "The survey period is 2020–2024; the estimate is not a point-in-time 2024 count."
    ]
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
    "limitations": [
      "ACS estimates are subject to sampling error; source estimate margins of error are retained. No margin of error is invented for a derived ratio.",
      "The survey period is 2020–2024; the estimate is not a point-in-time 2024 count."
    ]
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
    "limitations": [
      "ACS estimates are subject to sampling error; source estimate margins of error are retained. No margin of error is invented for a derived ratio.",
      "The survey period is 2020–2024; the estimate is not a point-in-time 2024 count."
    ]
  },
  {
    "id": "unemployment",
    "name": "Unemployment rate",
    "source": "BLS LAUS",
    "url": "https://www.bls.gov/opub/hom/lau/concepts.htm",
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
      "Use NSA LAUST state and LAUCN county series; seasonally adjusted LASST state series are not interchangeable.",
      "Preserve unemployed, employed, and labor-force component counts. Missing October 2025 stays missing, not zero.",
      "M13 is annual and is never computed from monthly observations.",
      "Monthly 2025 has no October observation; missing is not zero. Official annual M13 is used where published. No national rate is inferred by summing states."
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
    "limitations": [
      "ACS estimates are subject to sampling error; source estimate margins of error are retained. No margin of error is invented for a derived ratio.",
      "The survey period is 2020–2024; the estimate is not a point-in-time 2024 count."
    ]
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
      "The publisher reports participation/estimation coverage caveats by geography; retain caveats.",
      "This 2025 annual estimate is distinct from FBI CDE reported monthly observations.",
      "2025 population is the FBI source population, not ACS or PEP.",
      "FBI source footnote 3 marks limited 2025 data for both Florida and North Dakota; footnote markers and text are preserved on all offense rows.",
      "2025 FBI SRS count and population are from the same workbook record. FBI participation and estimation caveats remain attached. Limited-data footnote 3 applies to Florida and North Dakota; rape uses the revised definition."
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
      "The publisher reports participation/estimation coverage caveats by geography; retain caveats.",
      "This 2025 annual estimate is distinct from FBI CDE reported monthly observations.",
      "2025 population is the FBI source population, not ACS or PEP.",
      "FBI source footnote 3 marks limited 2025 data for both Florida and North Dakota; footnote markers and text are preserved on all offense rows.",
      "2025 FBI SRS count and population are from the same workbook record. FBI participation and estimation caveats remain attached. Limited-data footnote 3 applies to Florida and North Dakota; rape uses the revised definition."
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
      "The publisher reports participation/estimation coverage caveats by geography; retain caveats.",
      "This 2025 annual estimate is distinct from FBI CDE reported monthly observations.",
      "2025 population is the FBI source population, not ACS or PEP.",
      "FBI source footnote 3 marks limited 2025 data for both Florida and North Dakota; footnote markers and text are preserved on all offense rows.",
      "2025 FBI SRS count and population are from the same workbook record. FBI participation and estimation caveats remain attached. Limited-data footnote 3 applies to Florida and North Dakota; rape uses the revised definition."
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
      "The publisher reports participation/estimation coverage caveats by geography; retain caveats.",
      "This 2025 annual estimate is distinct from FBI CDE reported monthly observations.",
      "2025 population is the FBI source population, not ACS or PEP.",
      "FBI source footnote 3 marks limited 2025 data for both Florida and North Dakota; footnote markers and text are preserved on all offense rows.",
      "2025 FBI SRS count and population are from the same workbook record. FBI participation and estimation caveats remain attached. Limited-data footnote 3 applies to Florida and North Dakota; rape uses the revised definition."
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
      "The publisher reports participation/estimation coverage caveats by geography; retain caveats.",
      "This 2025 annual estimate is distinct from FBI CDE reported monthly observations.",
      "2025 population is the FBI source population, not ACS or PEP.",
      "FBI source footnote 3 marks limited 2025 data for both Florida and North Dakota; footnote markers and text are preserved on all offense rows.",
      "2025 FBI SRS count and population are from the same workbook record. FBI participation and estimation caveats remain attached. Limited-data footnote 3 applies to Florida and North Dakota; rape uses the revised definition."
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
      "The publisher reports participation/estimation coverage caveats by geography; retain caveats.",
      "This 2025 annual estimate is distinct from FBI CDE reported monthly observations.",
      "2025 population is the FBI source population, not ACS or PEP.",
      "FBI source footnote 3 marks limited 2025 data for both Florida and North Dakota; footnote markers and text are preserved on all offense rows.",
      "2025 FBI SRS count and population are from the same workbook record. FBI participation and estimation caveats remain attached. Limited-data footnote 3 applies to Florida and North Dakota; rape uses the revised definition."
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
      "The publisher reports participation/estimation coverage caveats by geography; retain caveats.",
      "This 2025 annual estimate is distinct from FBI CDE reported monthly observations.",
      "2025 population is the FBI source population, not ACS or PEP.",
      "Rape uses the revised definition field; legacy rape is not substituted.",
      "FBI source footnote 3 marks limited 2025 data for both Florida and North Dakota; footnote markers and text are preserved on all offense rows.",
      "2025 FBI SRS count and population are from the same workbook record. FBI participation and estimation caveats remain attached. Limited-data footnote 3 applies to Florida and North Dakota; rape uses the revised definition."
    ]
  },
  {
    "id": "obesity-rate",
    "name": "Obesity rate",
    "source": "CDC PLACES",
    "url": "https://www.cdc.gov/places/tools/data-portal.html",
    "formula": "05.14",
    "unit": "%",
    "period": "2023 BRFSS estimates, PLACES December 2025 release",
    "geography": [
      "county"
    ],
    "universe": "CDC PLACES county estimate for 2023. County observations only; state and national values are not inferred.",
    "classification": "native",
    "method": "Methodology provided by CDC PLACES. CDC PLACES county estimate for 2023. County observations only; state and national values are not inferred.",
    "limitations": [
      "For 2023-BRFSS measures, county estimates for Kentucky and Pennsylvania are unavailable.",
      "The release uses ACS 2019-2023 geography/covariate data and Census 2023 county population estimates; the PLACES period is annual/model-based, not an ACS five-year period.",
      "County estimates only; state and US values are not inferred. Kentucky and Pennsylvania county estimates are unavailable for the 2023 BRFSS measures. CDC PLACES estimates are modeled, not direct county surveys."
    ]
  },
  {
    "id": "diabetes-rate",
    "name": "Diabetes rate",
    "source": "CDC PLACES",
    "url": "https://www.cdc.gov/places/tools/data-portal.html",
    "formula": "05.15",
    "unit": "%",
    "period": "2023 BRFSS estimates, PLACES December 2025 release",
    "geography": [
      "county"
    ],
    "universe": "CDC PLACES county estimate for 2023. County observations only; state and national values are not inferred.",
    "classification": "native",
    "method": "Methodology provided by CDC PLACES. CDC PLACES county estimate for 2023. County observations only; state and national values are not inferred.",
    "limitations": [
      "For 2023-BRFSS measures, county estimates for Kentucky and Pennsylvania are unavailable.",
      "The release uses ACS 2019-2023 geography/covariate data and Census 2023 county population estimates; the PLACES period is annual/model-based, not an ACS five-year period.",
      "County estimates only; state and US values are not inferred. Kentucky and Pennsylvania county estimates are unavailable for the 2023 BRFSS measures. CDC PLACES estimates are modeled, not direct county surveys."
    ]
  },
  {
    "id": "physical-inactivity-rate",
    "name": "Physical inactivity rate",
    "source": "CDC PLACES",
    "url": "https://www.cdc.gov/places/tools/data-portal.html",
    "formula": "05.16",
    "unit": "%",
    "period": "2023 BRFSS estimates, PLACES December 2025 release",
    "geography": [
      "county"
    ],
    "universe": "CDC PLACES county estimate for 2023. County observations only; state and national values are not inferred.",
    "classification": "native",
    "method": "Methodology provided by CDC PLACES. CDC PLACES county estimate for 2023. County observations only; state and national values are not inferred.",
    "limitations": [
      "For 2023-BRFSS measures, county estimates for Kentucky and Pennsylvania are unavailable.",
      "The release uses ACS 2019-2023 geography/covariate data and Census 2023 county population estimates; the PLACES period is annual/model-based, not an ACS five-year period.",
      "County estimates only; state and US values are not inferred. Kentucky and Pennsylvania county estimates are unavailable for the 2023 BRFSS measures. CDC PLACES estimates are modeled, not direct county surveys."
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
      "A00100 is in thousands of dollars; multiply by 1,000 for USD.",
      "Exclude county FIPS 000 state totals when summing county records.",
      "A00100 source values are thousand USD; multiply by 1,000.",
      "US total is the sum of county A00100 stub rows 1–8; it is not a native IRS US total. Exclude state summary rows to avoid double counting. Source A00100 is thousand USD. No unavailable geography is imputed."
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
    "url": "https://www.eia.gov/electricity/data.php",
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
      "Retained state/DC observations are numeric rows only as displayed under the USCS suppression selector; do not infer hidden or suppressed values. Numerator diagnosis year 2023 and denominator is matching-year 2023 PEP population.",
      "USA Maps custom crude rate, not an age-adjusted rate. Never sum states to manufacture a US value; suppressed or absent observations remain missing.",
      "US uses the 2023 national case numerator with 2023 PEP total population; state-only numerator gaps remain missing."
    ],
    "additionalSources": [
      {
        "label": "Census PEP Vintage 2025 population estimates",
        "url": "https://www.census.gov/data/tables/time-series/demo/popest/2020s-counties-total.html"
      }
    ]
  },
  {
    "id": "new-hiv-diagnoses",
    "name": "New HIV diagnoses per 100,000 residents",
    "source": "CDC AtlasPlus/NHSS; Census PEP Vintage 2025 denominator",
    "url": "https://gis.cdc.gov/api/AtlasPlus/qtOutputData",
    "formula": "2024 provisional diagnoses, age 13+ ÷ 2024 annual PEP age 13+ population × 100,000",
    "unit": "per 100,000",
    "period": "2024 provisional diagnoses (reported through December 2025); age 13+",
    "geography": [
      "state"
    ],
    "universe": "2024 provisional diagnoses among people aged 13+ divided by matching-year 2024 Census PEP population aged 13+, multiplied by 100,000. This is a custom crude rate, not age-adjusted. Retained numerator inputs are state-only, so U.S. and county values remain missing.",
    "classification": "custom",
    "method": "Calculated by USA Maps. 2024 provisional diagnoses among people aged 13+ divided by matching-year 2024 Census PEP population aged 13+, multiplied by 100,000. This is a custom crude rate, not age-adjusted. Retained numerator inputs are state-only, so U.S. and county values remain missing.",
    "limitations": [
      "Retained local prepared observations are provisional 2024 diagnoses among age 13+ reported through Dec 2025; 12-month reporting delay. Use age-13+ same-year PEP population for a crude rate.",
      "USA Maps custom crude rate, not an age-adjusted rate. Never sum states to manufacture a US value; suppressed or absent observations remain missing.",
      "State numerator only; US and county results are missing, never zero. Provisional diagnoses have a 12-month reporting delay."
    ],
    "additionalSources": [
      {
        "label": "Census PEP Vintage 2025 age detail tables",
        "url": "https://www.census.gov/data/tables/time-series/demo/popest/2020s-state-detail.html"
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
      "state"
    ],
    "universe": "2024 resident deaths at ages 0–17 divided by matching-year 2024 Census PEP population aged 0–17, multiplied by 100,000. Suppressed counts remain missing. Retained numerator inputs are state-only, so U.S. and county values remain missing.",
    "classification": "custom",
    "method": "Calculated by USA Maps. 2024 resident deaths at ages 0–17 divided by matching-year 2024 Census PEP population aged 0–17, multiplied by 100,000. Suppressed counts remain missing. Retained numerator inputs are state-only, so U.S. and county values remain missing.",
    "limitations": [
      "2025 and later are provisional; do not replace the 2024 final metric automatically.",
      "Use age 0-17 deaths over July 1, 2024 population age 0-17.",
      "Suppressed cells remain missing; no zeros are fabricated.",
      "Use Census PEP single ages 0 through 17 for the denominator; suppressed mortality counts remain missing.",
      "USA Maps custom crude rate, not an age-adjusted rate. Never sum states to manufacture a US value; suppressed or absent observations remain missing.",
      "State numerator only; US and county results are missing, never zero. Suppressed counts remain missing."
    ],
    "additionalSources": [
      {
        "label": "Census PEP Vintage 2025 age detail tables",
        "url": "https://www.census.gov/data/tables/time-series/demo/popest/2020s-state-detail.html"
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
      "Broad alone-or-in-combination race definition; categories do not sum to 100%.",
      "Estimate MOEs retained; share MOE is not inferred.",
      "AIAN alone or in combination includes all Hispanic origins and can overlap other race categories; shares do not sum to 100%. Source estimate MOE is retained; no share MOE is inferred."
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
    "source": "MIT Election Data and Science Lab / Harvard Dataverse",
    "url": "https://dataverse.harvard.edu/dataverse/medsl",
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
      "History 2000–2024 retained; first interface selects 2024 only.",
      "Missing, invalid or unmatched geography remains explicit No data.",
      "Validated TOTAL mode only; no summing overlapping source voting modes.",
      "Only the 2024 cycle is initially selected. Missing, invalid, unmatched, or no-election areas remain distinct from numeric zero. No state or county totals are inferred.",
      "County geography; validated TOTAL voting mode only."
    ]
  },
  {
    "id": "elections-senate",
    "name": "Senate election",
    "source": "MIT Election Data and Science Lab / Harvard Dataverse",
    "url": "https://dataverse.harvard.edu/dataverse/medsl",
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
      "History 1976–2024 retained; first interface selects 2024 only.",
      "Missing, invalid or unmatched geography remains explicit No data.",
      "Regular-election interface; no-election states remain distinct from zero votes.",
      "Only the 2024 cycle is initially selected. Missing, invalid, unmatched, or no-election areas remain distinct from numeric zero. No state or county totals are inferred.",
      "State geography; regular elections only. No-election states are not zero-vote contests."
    ]
  },
  {
    "id": "elections-house",
    "name": "House election",
    "source": "MIT Election Data and Science Lab / Harvard Dataverse",
    "url": "https://dataverse.harvard.edu/dataverse/medsl",
    "formula": "Selected party votes ÷ validated TOTAL contest votes × 100",
    "unit": "%",
    "period": "2024 election cycle; source history 1976–2024; interface starts at 2024",
    "geography": [
      "congressional district"
    ],
    "universe": "Selected party vote share in the source-native 2024 contest.",
    "classification": "custom",
    "method": "Calculated by USA Maps. Selected party vote share in the source-native 2024 contest.",
    "limitations": [
      "History 1976–2024 retained; first interface selects 2024 only.",
      "Missing, invalid or unmatched geography remains explicit No data.",
      "119th Congress boundaries matched to 2024; no allocation into modern counties.",
      "Original House bytes verified against official Dataverse MD5 and UNF.",
      "Only the 2024 cycle is initially selected. Missing, invalid, unmatched, or no-election areas remain distinct from numeric zero. No state or county totals are inferred.",
      "119th Congress districts are matched to the 2024 contest; votes are not allocated to modern counties.",
      "435 voting districts are matched to the 119th Congress boundary vintage."
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
        "label": "Census PEP Vintage 2025 population estimates",
        "url": "https://www.census.gov/data/tables/time-series/demo/popest/2020s-counties-total.html"
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

const groups: [string,string[]][] = [
 ['Demographics, housing, income, education and work',['population','age','sex','race-ethnicity','race-ethnicity--white-non-hispanic','race-ethnicity--black','race-ethnicity--asian','race-ethnicity--aian','foreign-born-population','citizenship','median-household-income','per-capita-income','median-rent','median-home-value','mortgage-selected-monthly-owner-costs','rent-as-of-income-rent-burden','owner-renter-ratio','poverty','households-earning-200k','bachelors-degree','masters-degree','doctorate','high-school-attainment','no-diploma','work-from-home-share','adjusted-gross-income-agi','adjusted-gross-income-agi--per-resident']],
 ['Economy',['cost-of-living-regional-price-parities','electricity-price']], ['Employment',['unemployment']],
 ['Public safety',['murders','violent-crime','robbery','aggravated-assault','burglary','motor-vehicle-theft','rape']],
 ['Health',['obesity-rate','diabetes-rate','physical-inactivity-rate','all-cancer-new-cases','new-hiv-diagnoses','deaths-under-18']],
 ['Elections',['elections-president','elections-senate','elections-house']],
];
function Record({item}:{item:Method}) { return <article className="methodology-record" id={'method-'+item.id}><h3>{item.name}</h3><dl><dt>Source</dt><dd><a href={item.url} target="_blank" rel="noreferrer">{item.source} ↗</a>{item.additionalSources?.map(source=><span key={source.url}> · <a href={source.url} target="_blank" rel="noreferrer">{source.label} ↗</a></span>)}</dd><dt>Method</dt><dd>{item.method}</dd><dt>Formula</dt><dd><code>{item.formula}</code></dd><dt>Unit</dt><dd>{item.unit}</dd><dt>Universe</dt><dd>{item.universe}</dd><dt>Period</dt><dd>{item.period}</dd><dt>Geography</dt><dd>{item.geography.join(', ')}</dd><dt>Limitations</dt><dd>{item.limitations.join(' ')}</dd></dl></article>; }
export function Methodology() { const byId=new Map(methodologyRecords.map(item=>[item.id,item])); return <section className="about-story-row methodology" aria-labelledby="methodology-title"><h2 id="methodology-title">Data &amp; methodology</h2><div className="methodology-content"><p className="methodology-intro">Each indicator lists its source, calculation, unit, population or record universe, period, geography, and known gaps. A missing value means no usable observation was published; it is never changed to zero or filled by adding state values. Source estimates can have uncertainty or suppression; margins of error are not invented.</p><p className="methodology-intro">“Methodology provided by” identifies a measure and formula published by its source. “Calculated by USA Maps” identifies a rate or share derived here from source fields.</p>{groups.map(([title,ids])=><details className="methodology-group" key={title}><summary>{title}<span>{ids.length} indicators</span></summary><div className="methodology-list">{ids.map(id=>{const item=byId.get(id);return item?<Record key={id} item={item}/>:null})}</div></details>)}<details className="methodology-group methodology-retained"><summary>Retained but hidden data<span>1 indicator</span></summary><div className="methodology-list"><Record item={byId.get('fitness-recreation-centers-per-capita')!}/></div></details><p className="methodology-note"><strong>Unemployment:</strong> monthly 2025 observations and the separately published annual M13 value are distinct views; October 2025 is missing. Election office, cycle and geography limits appear with each election record.</p></div></section>; }
