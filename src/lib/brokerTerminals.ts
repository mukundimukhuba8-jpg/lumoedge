/**
 * Known MT5 broker servers with their web terminal URLs.
 * Used for broker search, connection, and trade routing when the
 * remote broker API is unavailable or incomplete.
 */

export type BrokerTerminalEntry = {
  /** MT5 server name passed to ConnectEx / OrderSend */
  server: string;
  /** Human-readable broker company */
  company: string;
  /** Web terminal URL for browser-based MT5 access */
  terminalUrl: string;
  /** live | demo */
  accountMode: 'live' | 'demo';
  site?: string;
};

/** Canonical list of supported broker terminals */
export const BROKER_TERMINALS: BrokerTerminalEntry[] = [
  {
    server: 'razormarkets-live',
    company: 'Razor Markets',
    terminalUrl: 'https://webtrader.razormarkets.co.za/terminal',
    accountMode: 'live',
    site: 'https://razormarkets.co.za',
  },
  {
    server: 'rcgmarkets-live',
    company: 'RCG Markets',
    terminalUrl: 'https://webtrader.rcgmarkets.com/terminal',
    accountMode: 'live',
    site: 'https://rcgmarkets.com',
  },
  {
    server: 'rcgmarkets-demo',
    company: 'RCG Markets',
    terminalUrl: 'https://webtrader-demo.rcgmarkets.com/terminal',
    accountMode: 'demo',
    site: 'https://rcgmarkets.com',
  },
  {
    server: 'accumarkets-live',
    company: 'AccuMarkets',
    terminalUrl: 'https://webterminal.accumarkets.co.za/terminal',
    accountMode: 'live',
    site: 'https://accumarkets.co.za',
  },
  {
    server: 'rockwest-server',
    company: 'Rock West',
    terminalUrl: 'https://webtrader.rock-west.com/terminal',
    accountMode: 'live',
    site: 'https://rock-west.com',
  },
  {
    server: 'luxetradingmarkets-live',
    company: 'Luxe Trading Markets',
    terminalUrl: 'https://webtrader.luxemarkets.forex/',
    accountMode: 'live',
    site: 'https://luxemarkets.forex',
  },
  {
    server: 'maonoglobalmarkets-live',
    company: 'Maono Global Markets',
    terminalUrl: 'https://web.maonoglobalmarkets.com/terminal',
    accountMode: 'live',
    site: 'https://maonoglobalmarkets.com',
  },
  {
    server: 'rocketx-live',
    company: 'RocketX',
    terminalUrl: 'https://webtrader.rocketx.io:1950/terminal',
    accountMode: 'live',
    site: 'https://rocketx.io',
  },
  {
    server: 'spacemarkets-live',
    company: 'Space Markets',
    terminalUrl: 'https://webtrader.spacemarkets.io:1960/terminal',
    accountMode: 'live',
    site: 'https://spacemarkets.io',
  },
  {
    server: 'deriv-demo',
    company: 'Deriv',
    terminalUrl: 'https://mt5-demo-web.deriv.com/terminal',
    accountMode: 'demo',
    site: 'https://deriv.com',
  },
  {
    server: 'derivsvg-server',
    company: 'Deriv (SVG)',
    terminalUrl: 'https://mt5-real01-web-svg.deriv.com/terminal',
    accountMode: 'live',
    site: 'https://deriv.com',
  },
  {
    server: 'derivsvg-server-02',
    company: 'Deriv (SVG)',
    terminalUrl: 'https://mt5-real02-web-svg.deriv.com/terminal',
    accountMode: 'live',
    site: 'https://deriv.com',
  },
  {
    server: 'derivsvg-server-03',
    company: 'Deriv (SVG)',
    terminalUrl: 'https://mt5-real03-web-svg.deriv.com/terminal',
    accountMode: 'live',
    site: 'https://deriv.com',
  },
  {
    server: 'derivbvi-server',
    company: 'Deriv (BVI)',
    terminalUrl: 'https://mt5-real01-web-bvi.deriv.com/terminal',
    accountMode: 'live',
    site: 'https://deriv.com',
  },
  {
    server: 'derivbvi-server-02',
    company: 'Deriv (BVI)',
    terminalUrl: 'https://mt5-real02-web-bvi.deriv.com/terminal',
    accountMode: 'live',
    site: 'https://deriv.com',
  },
  {
    server: 'derivbvi-server-03',
    company: 'Deriv (BVI)',
    terminalUrl: 'https://mt5-real03-web-bvi.deriv.com/terminal',
    accountMode: 'live',
    site: 'https://deriv.com',
  },
  {
    server: 'derivbvi-server-vu',
    company: 'Deriv (VU)',
    terminalUrl: 'https://mt5-real01-web-vu.deriv.com/terminal',
    accountMode: 'live',
    site: 'https://deriv.com',
  },
  {
    server: 'derivbvi-server-vu-02',
    company: 'Deriv (VU)',
    terminalUrl: 'https://mt5-real02-web-vu.deriv.com/terminal',
    accountMode: 'live',
    site: 'https://deriv.com',
  },
  {
    server: 'derivbvi-server-vu-03',
    company: 'Deriv (VU)',
    terminalUrl: 'https://mt5-real03-web-vu.deriv.com/terminal',
    accountMode: 'live',
    site: 'https://deriv.com',
  },
];

const byServer = new Map(
  BROKER_TERMINALS.map((entry) => [entry.server.toLowerCase(), entry]),
);

/** Resolve terminal URL for an MT5 server name (case-insensitive). */
export function getTerminalUrl(serverName: string): string | undefined {
  const key = serverName.trim().toLowerCase();
  return byServer.get(key)?.terminalUrl;
}

/** Resolve full broker terminal entry for a server name. */
export function getBrokerTerminal(serverName: string): BrokerTerminalEntry | undefined {
  return byServer.get(serverName.trim().toLowerCase());
}

/** Search local broker registry by company or server name. */
export function searchLocalBrokers(query: string): BrokerTerminalEntry[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  return BROKER_TERMINALS.filter(
    (entry) =>
      entry.company.toLowerCase().includes(q) ||
      entry.server.toLowerCase().includes(q) ||
      entry.server.toLowerCase().replace(/-/g, ' ').includes(q),
  );
}

