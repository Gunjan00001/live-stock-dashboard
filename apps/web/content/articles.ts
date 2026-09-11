export type ArticleBlock =
  | { type: "p"; text: string }
  | { type: "h2"; text: string }
  | { type: "stat"; value: string; label: string; note: string }
  | { type: "quote"; text: string; source: string }
  | { type: "list"; items: string[] }
  | { type: "callout"; text: string };

export interface Article {
  slug: string;
  title: string;
  category: string;
  tagline: string;
  readTime: string;
  updatedAt: string;
  author: string;
  heroQuote: { text: string; source: string };
  blocks: ArticleBlock[];
}

export const articles: Article[] = [
  {
    slug: "why-investing-matters",
    title: "Why investing matters: beating inflation, building wealth",
    category: "Basics",
    tagline: "Savings protect your money from being spent. Investing is how you give it a job — and keep up with the rising cost of living.",
    readTime: "6 min read",
    updatedAt: "02 Aug 2026",
    author: "Market Watch Desk",
    heroQuote: { text: "Someone is sitting in the shade today because someone planted a tree a long time ago.", source: "Warren Buffett" },
    blocks: [
      { type: "p", text: "Keep cash in a savings account and it stays safe — but it also slowly loses purchasing power. If prices rise 6% a year and your deposit earns 3%, the real value of your money falls roughly 3% every year. Over a decade, that quietly eats a large chunk of your savings." },
      { type: "stat", value: "≈5–6%", label: "India's long-run consumer price inflation", note: "Headline CPI has averaged roughly 5–6% in recent years. Deposit rates often sit close to that line, which means cash mostly treads water in real terms." },
      { type: "p", text: "Investing is the counter-move. Instead of just storing money, you put it to work in assets — equities, bonds, gold, real estate — that can grow faster than inflation. The trade-off is risk: markets go down as well as up, and you accept short-term volatility in exchange for long-term growth." },
      { type: "h2", text: "The long-run arithmetic of NIFTY 50" },
      { type: "p", text: "Equities have historically been the asset class most likely to outpace inflation over long periods. The NIFTY 50 has compounded at roughly 12–14% a year across multi-decade windows — but that smooth average hides stomach-churning swings within it. Bad years are part of the price of good decades." },
      { type: "stat", value: "~12–14%", label: "Long-run annualised return of NIFTY 50", note: "Historical estimate over multi-decade periods. Actual year-to-year returns vary widely; past performance is not a guarantee of future results." },
      { type: "h2", text: "Compounding is the engine" },
      { type: "p", text: "The real magic is that returns start earning returns of their own. Invested money compounds, and time is the multiplier. Start early, keep investing steadily, and let the snowball roll — the earlier you begin, the less dramatic the monthly amount you need to reach the same goal." },
      { type: "quote", text: "My wealth has come from a combination of living in America, some lucky genes, and compound interest.", source: "Warren Buffett" },
      { type: "list", items: ["Start early — even small amounts benefit hugely from time.", "Stay invested through drawdowns instead of trying to time the exits.", "Keep costs low and diversify across assets and companies."] },
      { type: "callout", text: "The point of investing isn't to get rich overnight. It's to give your money the chance to grow faster than inflation, for as long as your time horizon allows." },
    ],
  },
  {
    slug: "why-futures-and-options-is-risky",
    title: "Why futures & options is riskier than it looks",
    category: "Risk",
    tagline: "Leverage, time decay, and transaction costs stack the odds against retail traders. The data says most lose money.",
    readTime: "7 min read",
    updatedAt: "02 Aug 2026",
    author: "Market Watch Desk",
    heroQuote: { text: "In our view, however, derivatives are financial weapons of mass destruction.", source: "Warren Buffett, 2002 shareholder letter" },
    blocks: [
      { type: "p", text: "Futures and options (F&O) promise fast money with a small upfront cost. But the mechanics are stacked against most participants — and the regulator's own data paints a stark picture of who wins and who loses." },
      { type: "stat", value: "~89%", label: "Individual F&O traders who lost money", note: "SEBI's study of individual traders in the equity F&O segment for FY 2021–22 found roughly 89% incurred net losses." },
      { type: "h2", text: "The three enemies: leverage, theta, and costs" },
      { type: "list", items: ["Leverage: a small margin controls a large position, so a modest adverse move can wipe out your entire stake.", "Time decay (theta): every option loses value as expiry approaches, even if the underlying doesn't move at all.", "Costs: bid-ask spreads, exchange fees, and broker charges compound quickly when you trade frequently."] },
      { type: "p", text: "Derivatives are called that because their price is derived from an underlying asset — and the amplification cuts both ways. What feels like a cheap ticket to a big move is usually a trade where time and costs are quietly bleeding you dry." },
      { type: "h2", text: "What the data shows" },
      { type: "stat", value: "≈₹1.1 lakh", label: "Average net loss per losing individual F&O trader", note: "SEBI's analysis of individual traders in the F&O segment for FY 2021–22." },
      { type: "p", text: "The pattern repeats: a small minority captures most of the profits, while the majority pays. That isn't bad luck — it's the structure. You are trading against institutions with better data, faster execution, and far lower costs." },
      { type: "quote", text: "The stock market is a device for transferring money from the impatient to the patient.", source: "Warren Buffett" },
      { type: "callout", text: "If you trade F&O, treat it strictly as speculative money you can afford to lose — never as a savings plan, and never with funds you need." },
    ],
  },
  {
    slug: "the-power-of-compounding",
    title: "The power of compounding: how small amounts become large",
    category: "Basics",
    tagline: "The single most important idea in investing — and why starting early beats starting big.",
    readTime: "5 min read",
    updatedAt: "01 Aug 2026",
    author: "Market Watch Desk",
    heroQuote: { text: "Compound interest is the eighth wonder of the world. He who understands it, earns it; he who doesn't, pays it.", source: "Attributed to Albert Einstein" },
    blocks: [
      { type: "p", text: "Compounding is what happens when your investment returns generate returns of their own. Year one's gains are added to your capital, and year two's returns are calculated on the bigger base. Left alone for decades, the curve stops looking linear and starts bending sharply upward." },
      { type: "stat", value: "72 ÷ rate", label: "The Rule of 72", note: "Divide 72 by an annual return to estimate the years it takes to double your money — e.g. 12% ≈ 6 years, 6% ≈ 12 years." },
      { type: "h2", text: "Why time beats timing" },
      { type: "p", text: "Two investors, same returns, different start dates. The one who begins ten years earlier ends up far ahead — not because they were smarter, but because their money had more time to compound. Waiting for the 'perfect moment to enter' usually costs more than the timing mistake you were trying to avoid." },
      { type: "quote", text: "The stock market is designed to transfer money from the active to the patient.", source: "Warren Buffett" },
      { type: "h2", text: "Three habits that let compounding work" },
      { type: "list", items: ["Start now, even if the amount is small — time is the biggest input.", "Reinvest gains and dividends instead of spending them.", "Resist interrupting the process; compounding resets whenever you cash out and start over."] },
      { type: "callout", text: "Compounding is boring by design. The gains look small for years, then suddenly noticeable. Patience is the entire strategy." },
    ],
  },
  {
    slug: "index-investing-vs-stock-picking",
    title: "Index investing vs stock picking: which one works for you?",
    category: "Strategies",
    tagline: "Buying the index costs little and requires no genius. Picking stocks is harder — and most don't beat the index anyway.",
    readTime: "6 min read",
    updatedAt: "31 Jul 2026",
    author: "Market Watch Desk",
    heroQuote: { text: "A low-cost index fund is the most sensible equity investment for the great majority of investors.", source: "Warren Buffett" },
    blocks: [
      { type: "p", text: "Every investor eventually faces the same fork in the road: own the whole market cheaply, or try to choose individual winners. The honest answer is that both can work — but they demand very different amounts of skill, research, and emotional fortitude." },
      { type: "h2", text: "The case for index investing" },
      { type: "list", items: ["Diversification: you own dozens of companies at once, so no single failure breaks you.", "Low cost: expense ratios on index funds are a fraction of actively managed funds.", "Discipline: no decisions to get wrong, no temptation to chase the latest hot stock."] },
      { type: "p", text: "Over long periods, most actively managed funds underperform their benchmark after fees. Owning the index guarantees you roughly match the market's return, which is already better than what most active players achieve." },
      { type: "h2", text: "The case for stock picking" },
      { type: "p", text: "Picking individual stocks can outperform — if you genuinely understand the business, its moat, and its management, and you can hold through drawdowns. That last part is the hardest. Great businesses are frequently terrible stocks for people who can't sit still." },
      { type: "quote", text: "It's far better to buy a wonderful company at a fair price than a fair company at a wonderful price.", source: "Warren Buffett" },
      { type: "callout", text: "There is no shame in the index. For most people, a core of index funds — plus a small 'fun' allocation for stocks you truly understand — is the most honest strategy there is." },
    ],
  },
  {
    slug: "sip-and-rupee-cost-averaging",
    title: "SIPs and rupee-cost averaging: time in the market, not timing it",
    category: "Strategies",
    tagline: "Investing a fixed amount every month buys more units when prices fall and fewer when they rise — automatically.",
    readTime: "5 min read",
    updatedAt: "30 Jul 2026",
    author: "Market Watch Desk",
    heroQuote: { text: "Time in the market beats timing the market.", source: "A widely cited market maxim" },
    blocks: [
      { type: "p", text: "Nobody can reliably predict whether the market will be higher next month. But you don't need to. A systematic investment plan (SIP) removes the decision entirely: the same amount goes in on a fixed schedule, whether the market is euphoric or panicked." },
      { type: "stat", value: "≈ ₹99 lakh", label: "Growth of a ₹10,000/month SIP at ~12% over 20 years", note: "Illustrative example assuming 12% annualised returns; ignores taxes, fund costs, and withdrawals. Not a guarantee." },
      { type: "h2", text: "How rupee-cost averaging works" },
      { type: "p", text: "When prices fall, your fixed amount buys more units. When prices rise, it buys fewer. Over time the average purchase price smooths out — and, importantly, you were buying during the dips that scare everyone else into selling." },
      { type: "h2", text: "Discipline over prediction" },
      { type: "p", text: "The real edge of a SIP is behavioural. It forces you to stay invested through cycles and removes the emotional temptation to wait 'for a better entry'. Markets reward the committed far more than the clever." },
      { type: "quote", text: "Far more money has been lost by investors preparing for corrections, or trying to anticipate corrections, than has been lost in the corrections themselves.", source: "Peter Lynch" },
      { type: "callout", text: "Automation is the point. Set the SIP, forget the monthly decision, and let compounding plus discipline do the work." },
    ],
  },
  {
    slug: "how-to-read-a-balance-sheet",
    title: "How to read a balance sheet without an accounting degree",
    category: "Fundamentals",
    tagline: "Three statements reveal whether a business is growing, solvent, and actually generating cash. Here's the plain-English version.",
    readTime: "7 min read",
    updatedAt: "29 Jul 2026",
    author: "Market Watch Desk",
    heroQuote: { text: "The individual investor should act consistently as an investor and not as a speculator.", source: "Benjamin Graham" },
    blocks: [
      { type: "p", text: "You don't need to be a chartered accountant to judge a company's health. Three statements — the balance sheet, the profit-and-loss statement, and the cash-flow statement — answer the questions that matter most." },
      { type: "h2", text: "The balance sheet: what it owns vs what it owes" },
      { type: "list", items: ["Assets are what the company owns — cash, inventory, factories, receivables.", "Liabilities are what it owes — loans, payables, and debt due soon.", "Shareholders' equity is the remainder: what is left for owners after liabilities are met."] },
      { type: "p", text: "The key question is leverage. A company can fund growth with debt, but too much debt means interest payments that devour profits in a downturn. Compare total debt to equity, and check whether current assets comfortably cover short-term liabilities." },
      { type: "h2", text: "The P&L: is it actually making money?" },
      { type: "p", text: "The profit-and-loss statement tracks revenue, expenses, and profit over a period. Watch three things: whether revenue is growing, whether margins are stable or improving, and whether profit growth comes from the core business rather than one-off items." },
      { type: "h2", text: "Cash flow: cash is king" },
      { type: "stat", value: "OCF > Net profit", label: "A healthy long-term signal", note: "When operating cash flow consistently exceeds reported profit, earnings are 'real' rather than accounting adjustments." },
      { type: "p", text: "Reported profit can be flattered by accounting choices. Cash flow is harder to fake. A business that generates strong operating cash flow has options; one that relies on new borrowing just to stay afloat does not." },
      { type: "quote", text: "Price is what you pay. Value is what you get.", source: "Warren Buffett" },
      { type: "callout", text: "You're not looking for a perfect score. You're looking for red flags — rising debt with falling profits, or growth that never turns into cash." },
    ],
  },
  {
    slug: "diversification-and-asset-allocation",
    title: "Diversification and asset allocation: don't put all your eggs in one basket",
    category: "Risk",
    tagline: "Which assets you own matters more than which individual stocks you pick. Spread the risk, then stay the course.",
    readTime: "6 min read",
    updatedAt: "28 Jul 2026",
    author: "Market Watch Desk",
    heroQuote: { text: "The investor's chief problem — and even his worst enemy — is likely to be himself.", source: "Benjamin Graham" },
    blocks: [
      { type: "p", text: "Asset allocation is how you divide your money across broad categories — equities, debt, gold, cash. It matters more than most people think, because different assets rarely move in lockstep. When equities fall, bonds and gold often cushion the blow." },
      { type: "stat", value: "90%+", label: "Share of long-term return variance attributed to asset allocation", note: "Classic asset-allocation research (e.g., Brinson et al.) attributes most long-term variability across portfolios to allocation rather than individual selection." },
      { type: "h2", text: "Spreading risk within and across assets" },
      { type: "list", items: ["Across asset classes: combine equities, fixed income, and a small gold allocation.", "Within equities: own many sectors and companies rather than concentrating in one.", "Across time: SIPs spread entry points so you are never buying all at one price."] },
      { type: "h2", text: "A simple starting framework" },
      { type: "p", text: "A classic starter is Benjamin Graham's idea: keep the equity portion between 50% and 75%, with the rest in bonds or cash, and rebalance back to your target on a fixed schedule. Rebalancing forces you to sell what has run up and buy what has fallen — automatically buying low and selling high." },
      { type: "quote", text: "Diversification is protection against ignorance. It makes little sense for those who know what they're doing.", source: "Warren Buffett" },
      { type: "callout", text: "The goal is never maximum return. It is a portfolio you can actually stick with through the bad years." },
    ],
  },
  {
    slug: "valuation-basics",
    title: "Valuation basics: why price and value are not the same",
    category: "Fundamentals",
    tagline: "A stock's price is what the market is willing to pay today. Its value is what the business will earn you over time.",
    readTime: "7 min read",
    updatedAt: "27 Jul 2026",
    author: "Market Watch Desk",
    heroQuote: { text: "Price is what you pay; value is what you get.", source: "Warren Buffett" },
    blocks: [
      { type: "p", text: "Two companies in the same sector, same earnings, wildly different prices. That gap is valuation — the market's judgment about growth, risk, and quality. Understanding it is the difference between buying a bargain and overpaying for a story." },
      { type: "h2", text: "P/E: the price-to-earnings lens" },
      { type: "p", text: "The price-to-earnings ratio compares a company's share price to its earnings per share. A higher P/E means the market expects faster growth — but it also means you're paying more for every rupee of current profit, leaving less room for disappointment." },
      { type: "stat", value: "15–20x", label: "Rough long-run band for NIFTY 50's P/E", note: "The index's valuation moves with the economic cycle, interest rates, and growth. Always judge 'cheap' or 'expensive' relative to growth." },
      { type: "h2", text: "Growth and the PEG ratio" },
      { type: "p", text: "A high P/E looks less scary if growth is high. The PEG ratio divides P/E by the expected earnings growth rate. A PEG well below 1 suggests the market is underpaying for growth; far above 1 suggests you're paying for perfection." },
      { type: "h2", text: "The margin of safety" },
      { type: "p", text: "Benjamin Graham's core idea: buy only when the price is clearly below your estimate of value, so that your inevitable estimation errors don't cost you your capital. The margin of safety is what separates investment from speculation." },
      { type: "quote", text: "In the short run, the market is a voting machine but in the long run, it is a weighing machine.", source: "Benjamin Graham" },
      { type: "callout", text: "Valuation is not a precise science — it's a way of asking whether the price you're paying leaves room for being wrong." },
    ],
  },
  {
    slug: "investor-psychology",
    title: "Investor psychology: taming fear, greed, and your own brain",
    category: "Behaviour",
    tagline: "Most investing damage is self-inflicted. Understanding your biases is worth more than any stock tip.",
    readTime: "6 min read",
    updatedAt: "26 Jul 2026",
    author: "Market Watch Desk",
    heroQuote: { text: "Be fearful when others are greedy, and greedy when others are fearful.", source: "Warren Buffett" },
    blocks: [
      { type: "p", text: "Prices don't cause most losses — panic does. Investors systematically buy at the top because it feels safe, and sell at the bottom because it feels catastrophic. The market rarely triggers that behaviour; your own psychology does." },
      { type: "h2", text: "Common biases that cost money" },
      { type: "list", items: ["Loss aversion: the pain of losing is roughly twice as strong as the pleasure of gaining, so we sell losers early and hold losers too long.", "Herding: buying what everyone is buying, usually near the top.", "Recency bias: assuming the last few months of performance will continue forever.", "Overconfidence: mistaking a lucky streak for skill."] },
      { type: "h2", text: "The emotional cycle" },
      { type: "p", text: "Markets move in a well-worn arc: optimism, excitement, euphoria, then denial, fear, and capitulation. The vast majority of investors enter during excitement and exit during fear — the exact opposite of what the greats do." },
      { type: "h2", text: "Systems beat willpower" },
      { type: "list", items: ["Automate contributions so you never make a 'should I buy?' decision.", "Write down your goals and reasons before buying; reread them before selling.", "Rebalance on a schedule, not on a hunch.", "Keep a journal — the hindsight it creates is humbling and useful."] },
      { type: "quote", text: "The most important quality for an investor is temperament, not intellect.", source: "Warren Buffett" },
      { type: "callout", text: "You can't stop feeling fear and greed. You can only stop acting on them." },
    ],
  },
  {
    slug: "lessons-from-legendary-investors",
    title: "Lessons from legendary investors: what the greats did differently",
    category: "Wisdom",
    tagline: "Buffett, Graham, Lynch, Soros, Jhunjhunwala and Damani all played differently — but they share the same core habits.",
    readTime: "8 min read",
    updatedAt: "25 Jul 2026",
    author: "Market Watch Desk",
    heroQuote: { text: "Know what you own, and know why you own it.", source: "Peter Lynch" },
    blocks: [
      { type: "h2", text: "Warren Buffett: circle of competence and patience" },
      { type: "p", text: "Buffett invests only in businesses he understands, holds them for years, and treats price as secondary to quality. His edge is temperament: the ability to do nothing while the market panics." },
      { type: "h2", text: "Benjamin Graham: the margin of safety" },
      { type: "p", text: "The father of value investing bought assets priced below their worth, with a cushion against error. He framed investing as 'most thorough analysis' backed by 'margin of safety' — never pay full price for a flawed business." },
      { type: "h2", text: "Peter Lynch: buy what you understand" },
      { type: "p", text: "Lynch famously said to invest in businesses you meet in daily life. He believed you can spot a great company before Wall Street does — if you actually understand the product and the numbers." },
      { type: "h2", text: "George Soros: question every belief" },
      { type: "p", text: "Soros built his fortune on reflexivity — the idea that markets and reality feed back into each other. His discipline lay in cutting losing positions fast and letting winners run, and in constantly questioning his own thesis." },
      { type: "h2", text: "Rakesh Jhunjhunwala: conviction with patience" },
      { type: "p", text: "India's most famous trader-investor combined research with enormous patience, holding winners for years and riding volatility without flinching. He repeatedly said there are no shortcuts — only understanding and time." },
      { type: "h2", text: "Radhakishan Damani: price, value and temperament" },
      { type: "p", text: "The man behind DMart is known for buying quality businesses only at prices that make sense, then doing very little. His investing style mirrors his temperament: quiet, patient, and allergic to hype." },
      { type: "h2", text: "The patterns they share" },
      { type: "list", items: ["Understand what you own before you own it.", "Buy with a margin of safety and hold for years, not days.", "Let winners run and cut mistakes fast.", "Ignore the crowd and the daily noise.", "Temperament — patience under pressure — is the real skill."] },
      { type: "stat", value: "Years", label: "Typical holding horizon of disciplined investors", note: "The greats measure holding periods in business cycles and decades, not trading sessions." },
      { type: "quote", text: "Our favourite holding period is forever.", source: "Warren Buffett" },
      { type: "callout", text: "These investors used different methods and different markets, yet every one of them treated investing as a discipline — not a lottery ticket." },
    ],
  },
];

export function getAllArticles(): Article[] {
  return articles;
}

export function getArticle(slug: string): Article | undefined {
  return articles.find((article) => article.slug === slug);
}
