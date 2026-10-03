import { formatEth } from "@/lib/eth.ts"

export function EthValue({ value, className = "" }: { value: string; className?: string }) {
  return (
    <span className={className}>
      <span className="font-semibold text-amber">{formatEth(value)}</span>
      <span className="ml-1 text-xs font-semibold tracking-wide text-amber">ETH</span>
    </span>
  )
}
