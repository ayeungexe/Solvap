import {
  useMemo,
  useState,
  type ComponentType,
  type SVGProps,
} from "react";
import {
  useQuery,
  useInfiniteQuery,
} from "@tanstack/react-query";
import {
  ShieldCheck,
  Wallet,
  Database,
  Coins,
  ExternalLink,
  ArrowRight,
  Sparkles,
  Users,
  RefreshCcw,
  Scan,
  CheckCircle2,
  AlertCircle,
  Zap,
  TimerReset,
  Link2,
} from "lucide-react";
import { motion } from "framer-motion";
import type {
  RefundStats,
  TransactionsResponse,
  Transaction,
} from "@shared/types";
import { cn, formatDate, formatSol, truncateAddress } from "./lib/utils";
import { useServerEvents } from "./hooks/useServerEvents";

const WALLET_PROVIDERS = [
  {
    name: "Phantom",
    description: "Secure & user-friendly Solana wallet",
  },
  {
    name: "Solflare",
    description: "Advanced portfolio tooling & staking",
  },
];

interface WalletFlowState {
  status:
    | "disconnected"
    | "connecting"
    | "scanning"
    | "ready"
    | "refunding"
    | "success"
    | "error";
  provider?: string;
  walletAddress?: string;
  accountsFound: number;
  solAvailable: number;
  signature?: string;
  error?: string;
}

const initialWalletState: WalletFlowState = {
  status: "disconnected",
  accountsFound: 0,
  solAvailable: 0,
};

function createMockAddress() {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  return Array.from({ length: 44 }, () =>
    alphabet[Math.floor(Math.random() * alphabet.length)],
  ).join("");
}

async function fetchJSON<T>(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init);
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return (await response.json()) as T;
}

function useStats() {
  return useQuery<RefundStats>({
    queryKey: ["stats"],
    queryFn: () => fetchJSON<RefundStats>("/api/stats"),
    staleTime: 10_000,
  });
}

function useTransactions(pageSize = 10) {
  return useInfiniteQuery<TransactionsResponse>({
    queryKey: ["transactions", pageSize],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      fetchJSON<TransactionsResponse>(
        `/api/transactions?page=${pageParam}&pageSize=${pageSize}`,
      ),
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.page + 1 : undefined,
  });
}

type IconType = ComponentType<SVGProps<SVGSVGElement>>;

const statsCards = [
  {
    key: "totalUsers" as const,
    label: "Active Claimers",
    icon: Users,
  },
  {
    key: "totalAccountsClosed" as const,
    label: "Token Accounts Closed",
    icon: Database,
  },
  {
    key: "totalSolRefunded" as const,
    label: "SOL Returned To Users",
    icon: Coins,
  },
];

const faqItems = [
  {
    question: "How does the refund process work?",
    answer:
      "We connect to your wallet, scan for unused SPL token accounts, and close them in a single transaction. The reclaimed rent is returned to your wallet immediately after confirming the signature on-chain.",
  },
  {
    question: "Is this tool secure?",
    answer:
      "Yes. Your wallet connection stays on your device. Transactions are executed locally and sent directly to the Solana network. We never take custody of your keys or funds.",
  },
  {
    question: "What fee do you charge?",
    answer:
      "We deduct a transparent 15% success fee from the recovered rent to support infrastructure and validator costs.",
  },
  {
    question: "Which wallets are supported?",
    answer:
      "Phantom and Solflare are fully supported today. More wallets are coming soon—reach out if you have a specific request!",
  },
];

const partners = [
  {
    name: "Solana Vibe Station",
    url: "https://solanavibestation.com",
  },
  {
    name: "Mobula",
    url: "https://mobula.fi",
  },
];

export default function App() {
  const { data: stats, isLoading: statsLoading } = useStats();
  const transactionsQuery = useTransactions();
  const [walletState, setWalletState] = useState<WalletFlowState>(
    initialWalletState,
  );
  useServerEvents();

  const allTransactions = useMemo(
    () =>
      transactionsQuery.data?.pages.flatMap((page) => page.transactions) ?? [],
    [transactionsQuery.data],
  );

  function handleConnect(provider: string) {
    if (walletState.status !== "disconnected") return;
    const walletAddress = createMockAddress();
    setWalletState({
      status: "connecting",
      provider,
      walletAddress,
      accountsFound: 0,
      solAvailable: 0,
    });

    setTimeout(() => {
      setWalletState((prev) =>
        prev.provider === provider
          ? { ...prev, status: "scanning" }
          : prev,
      );
    }, 600);

    setTimeout(() => {
      const accounts = Math.floor(Math.random() * 6) + 3;
      const sol = Number((accounts * (0.18 + Math.random() * 0.05)).toFixed(2));
      setWalletState((prev) =>
        prev.provider === provider
          ? {
              ...prev,
              status: "ready",
              accountsFound: accounts,
              solAvailable: sol,
            }
          : prev,
      );
    }, 2000);
  }

  async function handleRefund() {
    if (walletState.status !== "ready" || !walletState.walletAddress) return;
    setWalletState((prev) => ({ ...prev, status: "refunding", error: undefined }));

    try {
      const payload = {
        walletAddress: walletState.walletAddress,
        accountsClosed: walletState.accountsFound,
        refundedSol: walletState.solAvailable * 0.85,
      };
      const response = await fetchJSON<Transaction>("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setWalletState((prev) => ({
        ...prev,
        status: "success",
        signature: response.txSignature,
      }));
    } catch (error) {
      setWalletState((prev) => ({
        ...prev,
        status: "error",
        error: error instanceof Error ? error.message : "Unexpected error",
      }));
    }
  }

  function handleReset() {
    setWalletState(initialWalletState);
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <ReferralBanner onReset={handleReset} />
      <main>
        <HeroSection />
        <section className="section-padding">
          <div className="section-container">
            <StatsGrid stats={stats} isLoading={statsLoading} />
          </div>
        </section>
        <section className="section-padding pt-0">
          <div className="section-container">
            <WalletWorkflow
              state={walletState}
              onConnect={handleConnect}
              onRefund={handleRefund}
              onReset={handleReset}
            />
          </div>
        </section>
        <section className="section-padding bg-slate-950/60">
          <div className="section-container">
            <TransactionTable
              query={transactionsQuery}
              transactions={allTransactions}
            />
          </div>
        </section>
        <section className="section-padding">
          <div className="section-container">
            <FaqSection />
          </div>
        </section>
        <section className="section-padding bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
          <div className="section-container">
            <PartnersSection />
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}

function ReferralBanner({ onReset }: { onReset: () => void }) {
  return (
    <div className="bg-gradient-to-r from-amber-500/90 via-fuchsia-500/80 to-indigo-500/80">
      <div className="section-container py-3 text-sm sm:text-base">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 font-medium text-slate-900">
            <Zap className="h-5 w-5" />
            Earn 35% commission from every wallet you refer
          </div>
          <button
            onClick={onReset}
            className="inline-flex items-center gap-2 rounded-full border border-slate-900/40 bg-slate-900/10 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-900 transition hover:bg-slate-900/20"
          >
            Reset Demo Flow
            <RefreshCcw className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-violet-700/30 via-indigo-600/20 to-sky-500/20">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,_#4f46e5_0%,_transparent_55%)] opacity-40" />
      <div className="section-container section-padding flex flex-col items-center text-center">
        <motion.span
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mb-6 inline-flex items-center gap-2 rounded-full border border-indigo-400/40 bg-slate-950/50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-indigo-200"
        >
          <ShieldCheck className="h-4 w-4" />
          Trusted by 42,000+ Solana users
        </motion.span>
        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="gradient-text text-4xl font-bold sm:text-5xl md:text-6xl lg:text-7xl"
        >
          Refund rent from idle token accounts instantly
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="mt-6 max-w-2xl text-base text-slate-300 sm:text-lg"
        >
          Close dusty SPL token accounts, reclaim the SOL locked inside, and keep your
          wallet lean. Secure, automated, and designed for power users who care about
          every lamport.
        </motion.p>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.65 }}
          className="mt-10 flex flex-wrap items-center justify-center gap-4 text-sm text-slate-300"
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-800/60 bg-slate-900/60 px-4 py-2">
            <TimerReset className="h-4 w-4 text-emerald-300" />
            Full scan takes ~18 seconds
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-800/60 bg-slate-900/60 px-4 py-2">
            <ShieldCheck className="h-4 w-4 text-sky-300" />
            Non-custodial by design
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-800/60 bg-slate-900/60 px-4 py-2">
            <Link2 className="h-4 w-4 text-violet-300" />
            One-click Solscan verification
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function StatsGrid({
  stats,
  isLoading,
}: {
  stats?: RefundStats;
  isLoading: boolean;
}) {
  return (
    <div className="grid gap-6 md:grid-cols-3">
      {statsCards.map(({ key, label, icon: Icon }) => (
        <div key={key} className="card-surface p-6 sm:p-8">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">
              {label}
            </p>
            <Icon className="h-5 w-5 text-indigo-300" />
          </div>
          <div className="mt-6 text-4xl font-bold">
            {isLoading || !stats ? (
              <span className="animate-pulse text-slate-600">•••</span>
            ) : key === "totalSolRefunded" ? (
              <span className="gradient-text text-5xl">
                {stats[key].toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
            ) : (
              stats[key].toLocaleString()
            )}
          </div>
          <p className="mt-4 text-sm text-slate-400">
            Updated {stats?.lastUpdated ? formatDate(stats.lastUpdated) : "recently"}
          </p>
        </div>
      ))}
    </div>
  );
}

function WalletWorkflow({
  state,
  onConnect,
  onRefund,
  onReset,
}: {
  state: WalletFlowState;
  onConnect: (provider: string) => void;
  onRefund: () => void;
  onReset: () => void;
}) {
  const steps = [
    {
      label: "Connect wallet",
      description: "Authorize secure access to begin scanning",
      icon: Wallet,
      active: state.status !== "disconnected",
      completed: ["scanning", "ready", "refunding", "success"].includes(state.status),
    },
    {
      label: "Scan token accounts",
      description: "Identify idle SPL accounts consuming rent",
      icon: Scan,
      active: ["scanning", "ready", "refunding", "success"].includes(state.status),
      completed: ["ready", "refunding", "success"].includes(state.status),
    },
    {
      label: "Close & refund",
      description: "Execute single transaction to reclaim SOL",
      icon: RefreshCcw,
      active: ["ready", "refunding", "success"].includes(state.status),
      completed: ["success"].includes(state.status),
    },
  ];

  return (
    <div className="grid gap-8 lg:grid-cols-[2fr,3fr]">
      <div className="card-surface flex flex-col gap-6 p-6 sm:p-8">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">Wallet connection</h2>
            <p className="mt-1 text-sm text-slate-400">
              Secure session with simulated Phantom and Solflare providers.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300">
            <ShieldCheck className="h-4 w-4" /> Secure connection
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {WALLET_PROVIDERS.map((provider) => (
            <button
              key={provider.name}
              onClick={() => onConnect(provider.name)}
              disabled={state.status !== "disconnected"}
              className={cn(
                "group flex items-center gap-3 rounded-xl border border-slate-800/80 bg-slate-900/70 px-4 py-3 text-left transition",
                state.provider === provider.name
                  ? "border-indigo-400/80 bg-indigo-500/10"
                  : "hover:border-indigo-400/60 hover:bg-indigo-500/10",
                state.status !== "disconnected" && state.provider !== provider.name
                  ? "opacity-40"
                  : "",
              )}
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-800/70 text-indigo-300">
                <Wallet className="h-5 w-5" />
              </div>
              <div>
                <p className="font-medium text-slate-100">{provider.name}</p>
                <p className="text-sm text-slate-400">{provider.description}</p>
              </div>
            </button>
          ))}
        </div>

        <div className="space-y-4">
          {steps.map((step, index) => (
            <div key={step.label} className="flex items-start gap-4">
              <div
                className={cn(
                  "mt-1 flex h-9 w-9 items-center justify-center rounded-full border border-slate-700/80",
                  step.completed
                    ? "border-emerald-400/60 bg-emerald-500/20 text-emerald-300"
                    : step.active
                    ? "border-indigo-400/60 bg-indigo-500/10 text-indigo-200"
                    : "text-slate-500",
                )}
              >
                <step.icon className="h-4 w-4" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-slate-100">{step.label}</p>
                  {step.completed && (
                    <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                  )}
                </div>
                <p className="text-sm text-slate-400">{step.description}</p>
                {index < steps.length - 1 && (
                  <div className="mt-4 h-px bg-gradient-to-r from-slate-800 via-slate-800/40 to-transparent" />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card-surface flex flex-col gap-6 p-6 sm:p-8">
        {state.status === "disconnected" && (
          <div className="flex flex-col items-center justify-center gap-4 py-12 text-center">
            <Sparkles className="h-10 w-10 text-indigo-300" />
            <div>
              <h3 className="text-lg font-semibold">Start by connecting a wallet</h3>
              <p className="mt-2 text-sm text-slate-400">
                We will guide you through a complete refund simulation with instant
                on-chain style analytics.
              </p>
            </div>
          </div>
        )}

        {state.status !== "disconnected" && (
          <div className="space-y-5">
            <div className="flex items-center justify-between rounded-xl border border-indigo-400/30 bg-indigo-500/10 px-4 py-3">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-indigo-200">Wallet</p>
                <p className="text-sm font-medium text-slate-100">
                  {truncateAddress(state.walletAddress ?? "")}
                </p>
              </div>
              <button
                onClick={onReset}
                className="text-xs font-medium text-indigo-200 hover:text-indigo-100"
              >
                Change wallet
              </button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <InfoTile
                label="Accounts detected"
                value={state.accountsFound.toString()}
                icon={Database}
              />
              <InfoTile
                label="Refund available"
                value={formatSol(state.solAvailable)}
                icon={Coins}
              />
            </div>

            {state.status === "connecting" && (
              <StatusPill icon={Wallet} text="Connecting wallet" />
            )}
            {state.status === "scanning" && (
              <StatusPill icon={Scan} text="Scanning token accounts" />
            )}
            {state.status === "ready" && (
              <div className="rounded-xl border border-emerald-400/40 bg-emerald-500/10 p-4 text-sm text-emerald-200">
                <p className="font-medium">Scan complete!</p>
                <p className="text-emerald-100/80">
                  {state.accountsFound} idle accounts ready to close. Estimated return
                  after our 15% fee: {formatSol(state.solAvailable * 0.85)}
                </p>
              </div>
            )}
            {state.status === "refunding" && (
              <StatusPill icon={RefreshCcw} text="Submitting transaction" />
            )}
            {state.status === "success" && (
              <div className="rounded-xl border border-emerald-400/60 bg-emerald-500/10 p-4 text-sm text-emerald-200">
                <p className="font-semibold">Refund complete</p>
                <p className="mt-1 text-emerald-100/80">
                  SOL returned instantly. View signature
                  {state.signature && (
                    <a
                      href={`https://solscan.io/tx/${state.signature}`}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-1 inline-flex items-center gap-1 text-emerald-100 underline decoration-dotted"
                    >
                      on Solscan
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </p>
              </div>
            )}
            {state.status === "error" && (
              <div className="rounded-xl border border-red-400/40 bg-red-500/10 p-4 text-sm text-red-200">
                <div className="flex items-start gap-2">
                  <AlertCircle className="mt-0.5 h-4 w-4" />
                  <div>
                    <p className="font-semibold">Refund failed</p>
                    <p className="text-red-100/80">
                      {state.error ?? "Something went wrong. Please retry."}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <button
              onClick={onRefund}
              disabled={state.status !== "ready"}
              className={cn(
                "group inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-indigo-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition",
                state.status !== "ready"
                  ? "cursor-not-allowed opacity-50"
                  : "hover:from-violet-400 hover:to-indigo-400",
              )}
            >
              Close accounts & refund SOL
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function InfoTile({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: IconType;
}) {
  return (
    <div className="rounded-xl border border-slate-800/60 bg-slate-900/70 p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">{label}</p>
        <Icon className="h-4 w-4 text-indigo-300" />
      </div>
      <p className="mt-3 text-lg font-semibold text-slate-100">{value}</p>
    </div>
  );
}

function StatusPill({
  icon: Icon,
  text,
}: {
  icon: IconType;
  text: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-full border border-indigo-400/40 bg-indigo-500/10 px-3 py-2 text-xs font-medium text-indigo-200">
      <Icon className="h-4 w-4 animate-spin" />
      {text}
    </div>
  );
}

function TransactionTable({
  query,
  transactions,
}: {
  query: ReturnType<typeof useTransactions>;
  transactions: Transaction[];
}) {
  return (
    <div className="card-surface p-6 sm:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold">Live transaction feed</h2>
          <p className="text-sm text-slate-400">
            Real-time view of rent refunds confirmed on Solana mainnet.
          </p>
        </div>
        <button
          onClick={() => query.refetch()}
          className="inline-flex items-center gap-2 rounded-full border border-slate-800/60 px-4 py-2 text-sm text-slate-300 transition hover:border-indigo-400/40 hover:text-indigo-200"
        >
          Refresh
          <RefreshCcw className={cn("h-4 w-4", query.isFetching && "animate-spin")}
          />
        </button>
      </div>

      <div className="mt-6 hidden overflow-hidden rounded-2xl border border-slate-800/60 bg-slate-950/40 md:block">
        <table className="min-w-full divide-y divide-slate-800/70 text-sm">
          <thead className="bg-slate-900/80">
            <tr>
              {[
                "Wallet",
                "Accounts",
                "Refunded SOL",
                "Signature",
                "Timestamp",
              ].map((header) => (
                <th
                  key={header}
                  className="px-4 py-3 text-left font-medium uppercase tracking-[0.2em] text-slate-400"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {transactions.map((transaction) => (
              <tr
                key={transaction.id}
                className="transition hover:bg-slate-900/60"
              >
                <td className="px-4 py-3 font-mono text-xs text-slate-300">
                  {truncateAddress(transaction.walletAddress)}
                </td>
                <td className="px-4 py-3 text-slate-200">
                  {transaction.accountsClosed}
                </td>
                <td className="px-4 py-3 font-medium text-emerald-300">
                  {formatSol(transaction.refundedSol)}
                </td>
                <td className="px-4 py-3">
                  <a
                    href={`https://solscan.io/tx/${transaction.txSignature}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-indigo-200 hover:text-indigo-100"
                  >
                    {truncateAddress(transaction.txSignature, 6)}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </td>
                <td className="px-4 py-3 text-slate-400">
                  {formatDate(transaction.createdAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6 space-y-4 md:hidden">
        {transactions.map((transaction) => (
          <div
            key={transaction.id}
            className="rounded-2xl border border-slate-800/60 bg-slate-900/60 p-4"
          >
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>{formatDate(transaction.createdAt)}</span>
              <span>{transaction.accountsClosed} accounts</span>
            </div>
            <p className="mt-2 font-mono text-sm text-slate-300">
              {truncateAddress(transaction.walletAddress)}
            </p>
            <p className="mt-2 text-sm font-semibold text-emerald-300">
              {formatSol(transaction.refundedSol)}
            </p>
            <a
              href={`https://solscan.io/tx/${transaction.txSignature}`}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-xs text-indigo-200"
            >
              View signature
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        ))}
      </div>

      <div className="mt-8 flex justify-center">
        <button
          onClick={() => query.fetchNextPage()}
          disabled={!query.hasNextPage || query.isFetchingNextPage}
          className={cn(
            "inline-flex items-center gap-2 rounded-full border border-slate-800/60 px-6 py-2 text-sm text-slate-200 transition",
            query.hasNextPage
              ? "hover:border-indigo-400/40 hover:text-indigo-200"
              : "opacity-50",
          )}
        >
          {query.isFetchingNextPage ? "Loading…" : query.hasNextPage ? "Load more" : "No more results"}
        </button>
      </div>
    </div>
  );
}

function FaqSection() {
  return (
    <div className="grid gap-10 lg:grid-cols-[1fr,1.2fr]">
      <div>
        <h2 className="text-3xl font-bold text-slate-100 sm:text-4xl">
          Frequently asked questions
        </h2>
        <p className="mt-3 text-sm text-slate-400">
          Everything you need to know about reclaiming SOL from idle accounts.
        </p>
      </div>
      <div className="space-y-4">
        {faqItems.map((item) => (
          <details
            key={item.question}
            className="group rounded-2xl border border-slate-800/60 bg-slate-900/60 p-6"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left text-base font-medium text-slate-100">
              {item.question}
              <span className="text-indigo-300 transition group-open:rotate-45">+</span>
            </summary>
            <p className="mt-4 text-sm text-slate-400">{item.answer}</p>
          </details>
        ))}
      </div>
    </div>
  );
}

function PartnersSection() {
  return (
    <div className="card-surface p-6 sm:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-100">Infrastructure partners</h2>
          <p className="text-sm text-slate-400">
            Battle-tested Solana teams helping us keep your refunds fast.
          </p>
        </div>
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {partners.map((partner) => (
          <a
            key={partner.name}
            href={partner.url}
            target="_blank"
            rel="noreferrer"
            className="group flex flex-col items-center gap-3 rounded-2xl border border-slate-800/60 bg-slate-900/60 p-6 text-center transition hover:border-indigo-400/40 hover:bg-indigo-500/5"
          >
            <div className="flex h-20 w-20 items-center justify-center rounded-full border border-indigo-400/40 bg-slate-900/70 text-indigo-200">
              <Sparkles className="h-8 w-8" />
            </div>
            <p className="font-medium text-slate-100">{partner.name}</p>
            <span className="text-xs uppercase tracking-[0.3em] text-indigo-200">
              Visit site
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}

function Footer() {
  return (
    <footer className="border-t border-slate-900/60 bg-slate-950/80">
      <div className="section-container py-12">
        <div className="flex flex-col gap-6 text-sm text-slate-400 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-base font-semibold text-slate-100">Refund Your SOL</p>
            <p className="mt-1 max-w-md text-slate-400">
              Built for power users who care about every lamport. We close dormant token
              accounts and return the rent to your wallet instantly.
            </p>
          </div>
          <div className="space-y-2">
            <p className="font-medium text-slate-200">Contact</p>
            <a href="mailto:hello@refundyoursol.com">hello@refundyoursol.com</a>
            <div className="flex gap-4">
              <a href="https://twitter.com/solana" target="_blank" rel="noreferrer">
                Twitter
              </a>
              <a href="https://discord.com/invite/solana" target="_blank" rel="noreferrer">
                Discord
              </a>
            </div>
          </div>
        </div>
        <div className="mt-8 flex flex-col gap-2 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Refund Your SOL. All rights reserved.</p>
          <div className="flex gap-4">
            <a href="#">Privacy</a>
            <a href="#">Terms</a>
            <a href="#">Security</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
