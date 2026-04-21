import { Connection, Commitment, Cluster } from "@solana/web3.js";

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "https://api.devnet.solana.com";
const NETWORK = (process.env.NEXT_PUBLIC_NETWORK || "devnet") as Cluster;
const COMMITMENT: Commitment = "confirmed";

let _connection: Connection | null = null;

export function getConnection(): Connection {
  if (!_connection) _connection = new Connection(RPC_URL, COMMITMENT);
  return _connection;
}

export const NETWORK_LABEL = NETWORK;
export const RPC_ENDPOINT = RPC_URL;
