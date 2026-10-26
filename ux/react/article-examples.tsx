import type { ReactNode } from 'react';

export const articleExamples = {
  pitkin: {
    title: "Why does Pitkin County rank above San Francisco for income?",
    deck: "Pitkin County’s income per person is $105,496, above San Francisco’s $92,289. Yet its typical full-time worker earns less. Money from assets helps explain the apparent contradiction.",
    body: String.raw`Home to Aspen, Pitkin County sits above San Francisco in the Census Bureau’s income-per-person estimates: $105,496 against $92,289. But switch to the [Census Bureau’s median earnings for people who work full-time throughout the year](https://data.census.gov/table/ACSDT5Y2024.B20018), and the order reverses. Pitkin’s figure is $76,860; San Francisco’s is $116,476.

The first comparison includes money residents receive from assets as well as work. In Pitkin, interest, dividends and net rental income account for about 22% of all household income, compared with about 6% in San Francisco. That is a concrete part of the explanation: a place can have an exceptionally high income average without offering exceptionally high pay to its typical worker.

The full-time earnings comparison uses an additional Census table; this measure is not currently an indicator on the USA Maps map.

All these Census figures come from the [2020–2024 American Community Survey](https://data.census.gov/table/ACSDT5Y2024.B19301). They estimate annual amounts using responses collected over five years, with earlier dollar amounts adjusted to 2024 buying power. They are neither five years of income added together nor a survey of 2024 salaries alone.

## Money from assets changes the comparison

The Census asks about wages, net self-employment income, interest, dividends, net rent, retirement income, Social Security and other cash income. Its [income definition](https://www2.census.gov/programs-surveys/acs/tech_docs/subject_definitions/2024_ACSSubjectDefinitions.pdf) measures money before personal income taxes. Capital gains from selling assets and increases in an unsold home’s or stock portfolio’s value are excluded.

A resident can therefore contribute substantial income to Pitkin’s average through investments, regardless of whether that person holds a local job. A visitor who owns a second home does not automatically become a resident counted in that average.

The survey’s [household income totals](https://data.census.gov/table/ACSDT5Y2024.B19064) show how different the two counties’ income mixes are:

| Source of household income | Pitkin County | San Francisco County |
|---|---:|---:|
| Wages and salaries | 59.8% | 81.9% |
| Net self-employment income | 8.1% | 4.6% |
| Interest, dividends and net rental income | 21.6% | 6.4% |
| Retirement income | 5.9% | 3.3% |
| Social Security | 3.5% | 2.7% |
| Supplemental Security Income | 0.1% | 0.4% |
| Cash public assistance | 0.1% | 0.1% |
| Other cash income | 1.0% | 0.7% |

Both columns cover the full income total. These are shares of household income dollars, rather than the percentage of households receiving each type. Rounding means the displayed rows may not add to exactly 100%.

The finding also fits earlier local reporting. An [Aspen Journalism investigation published in April 2024](https://www.aspentimes.com/news/aspen-journalism-pitkin-countys-per-capita-income-third-highest-in-the-u-s-highlights-growing-disparity-with-wages/) traced the separation between residents’ investment income and pay from local jobs, alongside workers commuting from surrounding counties. Its figures used a different federal income measure; the table above keeps our comparison within the same Census survey.

Where those workers live matters. Someone who serves customers in Aspen but lives in another county contributes to that other county’s resident income statistics. The Aspen economy and the population inside Pitkin’s boundary are different groups.

## The average can rise far above the middle

Per-capita income adds residents’ income and divides by the entire population, including children. Large incomes pull that average upward. To see the arithmetic, imagine ten people receiving $50,000 each. Add one person receiving $1 million, and the average rises to about $136,000, even though the original ten still receive $50,000. This is an illustration, not a description of eleven actual Pitkin residents.

A median finds the middle instead. The [household income median](https://data.census.gov/table/ACSDT5Y2024.B19013) is $102,645 in Pitkin and $140,970 in San Francisco. Roughly half the households in each county are below its figure and half above.

That reverses the original ordering too. It shows why the income-per-person table cannot settle where a typical household has more money. A household may contain several people and earners; its median is a separate measure, not another version of the per-person average.

## What if children are removed from the calculation?

Pitkin’s survey population is 16,985, including 2,484 people under 18. Divide the same aggregate income only among its 14,501 adults, and the result is about **$123,600 per adult**. Do the equivalent calculation for San Francisco and the result is about **$106,900**.

This answers a useful “what if”: changing the population used in the division does not reverse this comparison. But these are recalculations that leave the income pot unchanged. A true adult-only income average would also remove income received by 15–17-year-olds, whose income is included in the Census total. The tables used here do not isolate that amount. The $123,600 is therefore an illustration of the denominator change, not a published estimate of what Pitkin’s adults earn.

## Where familiar places appear in the ranking

Sorting the published per-capita estimates puts Pitkin first among 3,144 counties and county equivalents in the 50 states and Washington, D.C. Here are some recognizable places on that list:

| Familiar place | County geography actually measured | Income per person | Rank |
|---|---|---:|---:|
| Aspen | Pitkin County, Colorado | $105,496 | 1 |
| Manhattan | New York County, New York | $95,980 | 2 |
| San Francisco | San Francisco County, California | $92,289 | 4 |
| Washington, D.C. | District of Columbia | $77,348 | 15 |
| Atlanta area | Fulton County, Georgia | $63,269 | 47 |
| Boston area | Suffolk County, Massachusetts | $58,636 | 82 |
| Brooklyn | Kings County, New York | $47,575 | 287 |

Manhattan is only one of New York City’s five boroughs. Suffolk includes Boston and other communities; Fulton includes part of Atlanta and other communities. Those boundaries help explain why familiar city names do not produce a neat city ranking.

## Why Pitkin’s first place is less certain than it looks

The Census surveys a sample of residents, so its estimate has some sampling uncertainty. The margin of error expresses how much room to allow around that estimate. Pitkin’s published $105,496 comes with a margin of **plus or minus $13,363**, giving a range of $92,133 to $118,859.

That is a 90% confidence interval: if the sampling process were repeated many times, about nine in ten intervals calculated this way would contain the population’s actual average. It does not mean that nine in ten residents receive an income in that range.

San Francisco’s margin is much smaller, at $1,250. Sample size and the variation in what people receive affect precision; a small county with widely differing incomes can be harder to summarize reliably. Pitkin has about 17,000 residents, against San Francisco’s roughly 830,000. Population size is context, rather than a formula for the published margin.

Using the Census comparison method, the data do not establish a clear Pitkin lead over San Francisco at the 90% confidence level. The table orders estimates; it cannot award an undisputed first place.

The more useful discovery survives that uncertainty. Pitkin’s high average sits alongside a much larger investment-income share, lower typical full-time earnings and a lower household median than San Francisco’s. Aspen’s county illustrates how money received by residents can tell a very different story from the pay attached to their work.`,
  },
  losAlamos: {
    title: "Why does Los Alamos have so many PhDs and household income near $150,000?",
    deck: "Nearly one in five residents aged 25 or older has a doctorate, and household income has a $147,139 median. A national laboratory helps explain how those two features came together.",
    body: String.raw`Los Alamos County, New Mexico, has fewer than 20,000 residents. Yet nearly one in five adults aged 25 or older has a doctorate, and the median household income is $147,139. What produces that combination in such a small place?

The central explanation is Los Alamos National Laboratory: a large scientific employer whose work attracts people with specialist training and pays substantial salaries. Its own financial report supplies a direct connection to local residents. In fiscal year 2024, the laboratory paid about **$794 million in salaries to employees living in Los Alamos County**.

## A community formed around a scientific mission

Los Alamos did not develop as an ordinary town that later happened to acquire a laboratory. The federal government established the laboratory in 1943 to design and build an atomic bomb as part of the [Manhattan Project](https://www.energy.gov/em/manhattan-project-department-energy-formation-1939-1977). Its scientific mission helped shape the community from the beginning.

The institution remains a large employer. Its [FY2024 economic-impact report](https://cdn.lanl.gov/files/economic-impact-25-st-v4_73055.pdf) lists 16,547 employees, excluding contractors, and a total laboratory budget of $5.24 billion. That budget supports salaries, equipment, facilities and work across the institution.

For scale, the lab’s workforce is about **85% as large as Los Alamos County’s entire population of 19,435**. More than 65% of the employees lived outside the county, so the comparison shows the employer’s size rather than the share of residents who work there.

Among residents aged 25 or older, the survey estimates 2,590 doctorate holders out of 14,040 people: **18.4%**, compared with **1.7% nationally**. The laboratory provides a clear institutional reason for this concentration of specialist qualifications. The county figures do not identify which individual graduates work there.

## High earnings show up beyond the household headline

The $147,139 household income figure is a median: half of households fall above it and half below it. A household can combine several people’s incomes, including retirement or investment income, so that number is not the typical scientist’s salary.

<!-- article-map:household-income -->

There is a useful second check. For residents who work full-time throughout the year, [median annual earnings](https://data.census.gov/table/ACSDT5Y2024.B20018) are **$108,894**, compared with **$61,657 nationally**. That comparison concerns individual workers, and it too points to unusually high earnings.

The education and earnings figures come from the 2020–2024 American Community Survey. Its income figures estimate annual income using responses collected across five years and express the amounts in 2024 dollars. The lab’s fiscal-year accounts are a separate source showing the scale and destination of its salary payments.

## What scientific jobs at the lab actually advertise

The laboratory’s own vacancies make the pay easier to picture. These examples were listed on its careers site when checked on **October 26, 2026**:

| Scientific role | Advertised annual salary |
|---|---:|
| [Astrophysics postdoctoral researcher](https://lanl.jobs/search/jobdetails/astrophysics-postdoctoral-researcher/53d46566-456a-46a9-8107-755a725b2849) | From $97,000 |
| [Computational electrodynamics accelerator physicist, Scientist 2](https://lanl.jobs/search/jobdetails/computational-electrodynamics-accelerator-physicist-23/213d645f-ecbe-4939-9bd6-34dd41f5b6ad) | $106,400–$176,000 |
| [Senior nuclear diagnostics and imaging physicist, Scientist 4](https://lanl.jobs/search/jobdetails/senior-nuclear-diagnostics-and-imaging-physicist-scientist-34/d9835153-b74a-402c-a407-41af4ed870a1) | $153,600–$266,500 |

These are salary offers for identified positions and levels, rather than an average for all scientists. They show the pay attached to specific research work; they are 2026 examples alongside the earlier Census income figures.

The salary money also reaches neighboring communities. In FY2024, the lab paid roughly $504 million to employees living in Santa Fe County and $215 million to those in Rio Arriba County, as well as the $794 million paid to Los Alamos County residents.

A scientific institution helped form Los Alamos in 1943 and still sends hundreds of millions of dollars in salaries to county residents. That enduring connection between research, specialist workers and paid work explains why advanced degrees and high incomes appear together on this small patch of New Mexico.`,
  },
} as const;

export type ArticleExample = (typeof articleExamples)[keyof typeof articleExamples];

function inline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|\[[^\]]+\]\(https?:\/\/[^)]+\))/g;
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > cursor) parts.push(text.slice(cursor, index));
    const token = match[0];
    if (token.startsWith('**')) parts.push(<strong key={index}>{token.slice(2, -2)}</strong>);
    else {
      const link = token.match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/)!;
      parts.push(<a key={index} href={link[2]} target="_blank" rel="noreferrer">{link[1]}</a>);
    }
    cursor = index + token.length;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts;
}

function tableRows(block: string): string[][] {
  return block.split('\n').filter(Boolean).map((line) =>
    line.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim()),
  ).filter((row) => !row.every((cell) => /^:?-{3,}:?$/.test(cell)));
}

export function ArticleExampleBody({ article, householdMap }: { article: ArticleExample; householdMap?: ReactNode }) {
  const blocks = article.body.split(/\n\n+/);
  return <>
    {blocks.map((block, index) => {
      if (block === '<!-- article-map:household-income -->') return <div key={index}>{householdMap}</div>;
      if (block.startsWith('## ')) return <h2 key={index}>{block.slice(3)}</h2>;
      if (block.startsWith('|')) {
        const [header, ...rows] = tableRows(block);
        return <div className="article-table-scroll" role="region" aria-label={header.join(', ')} tabIndex={0} key={index}>
          <table><thead><tr>{header.map((cell, i) => <th scope="col" key={i}>{inline(cell)}</th>)}</tr></thead>
            <tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{inline(cell)}</td>)}</tr>)}</tbody>
          </table>
        </div>;
      }
      return <p key={index}>{inline(block)}</p>;
    })}
  </>;
}
