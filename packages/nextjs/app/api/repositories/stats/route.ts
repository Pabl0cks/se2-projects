import { NextResponse } from "next/server";
import { Pool } from "pg";

// Mock data for fallback when database is unavailable
const mockStats = {
  totalRepos: 1247,
  deletedRepos: 23,
  sourceStats: [
    { source: "github", count: 856 },
    { source: "npm", count: 234 },
    { source: "manual", count: 157 },
  ],
  topStars: [
    {
      full_name: "scaffold-eth/scaffold-eth-2",
      name: "scaffold-eth-2",
      owner: "scaffold-eth",
      stars: 8542,
      forks: 2341,
      url: "https://github.com/scaffold-eth/scaffold-eth-2",
      source: ["github", "npm"],
    },
    {
      full_name: "awesome-dev/defi-protocol",
      name: "defi-protocol",
      owner: "awesome-dev",
      stars: 6234,
      forks: 1892,
      url: "https://github.com/awesome-dev/defi-protocol",
      source: ["github"],
    },
    {
      full_name: "crypto-builder/nft-marketplace",
      name: "nft-marketplace",
      owner: "crypto-builder",
      stars: 5123,
      forks: 1456,
      url: "https://github.com/crypto-builder/nft-marketplace",
      source: ["github"],
    },
    {
      full_name: "web3-developer/token-factory",
      name: "token-factory",
      owner: "web3-developer",
      stars: 4892,
      forks: 1234,
      url: "https://github.com/web3-developer/token-factory",
      source: ["github", "npm"],
    },
    {
      full_name: "ethereum-dev/dapp-template",
      name: "dapp-template",
      owner: "ethereum-dev",
      stars: 4567,
      forks: 1123,
      url: "https://github.com/ethereum-dev/dapp-template",
      source: ["github"],
    },
    {
      full_name: "blockchain-studio/dao-governance",
      name: "dao-governance",
      owner: "blockchain-studio",
      stars: 4234,
      forks: 987,
      url: "https://github.com/blockchain-studio/dao-governance",
      source: ["github"],
    },
    {
      full_name: "defi-labs/lending-protocol",
      name: "lending-protocol",
      owner: "defi-labs",
      stars: 3891,
      forks: 876,
      url: "https://github.com/defi-labs/lending-protocol",
      source: ["github", "npm"],
    },
    {
      full_name: "crypto-innovator/staking-platform",
      name: "staking-platform",
      owner: "crypto-innovator",
      stars: 3456,
      forks: 765,
      url: "https://github.com/crypto-innovator/staking-platform",
      source: ["github"],
    },
    {
      full_name: "web3-wizard/multi-sig-wallet",
      name: "multi-sig-wallet",
      owner: "web3-wizard",
      stars: 3123,
      forks: 654,
      url: "https://github.com/web3-wizard/multi-sig-wallet",
      source: ["github"],
    },
    {
      full_name: "ethereum-builder/contract-library",
      name: "contract-library",
      owner: "ethereum-builder",
      stars: 2987,
      forks: 543,
      url: "https://github.com/ethereum-builder/contract-library",
      source: ["github", "npm"],
    },
  ],
  recentRepos: 47,
  totals: {
    totalStars: 125678,
    totalForks: 34567,
  },
  topOwners: [
    { owner: "scaffold-eth", repo_count: 12, total_stars: "12345" },
    { owner: "awesome-dev", repo_count: 8, total_stars: "9876" },
    { owner: "crypto-builder", repo_count: 7, total_stars: "8765" },
    { owner: "web3-developer", repo_count: 6, total_stars: "7654" },
    { owner: "ethereum-dev", repo_count: 5, total_stars: "6543" },
    { owner: "blockchain-studio", repo_count: 5, total_stars: "5432" },
    { owner: "defi-labs", repo_count: 4, total_stars: "4321" },
    { owner: "crypto-innovator", repo_count: 4, total_stars: "3210" },
    { owner: "web3-wizard", repo_count: 3, total_stars: "2109" },
    { owner: "ethereum-builder", repo_count: 3, total_stars: "1098" },
  ],
};

export async function GET() {
  // Check if database connection string is available
  if (!process.env.POSTGRES_URL) {
    console.log("No POSTGRES_URL found, using mock data");
    return NextResponse.json(mockStats);
  }

  const pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
  });

  try {
    const client = await pool.connect();

    try {
      // Get total repositories count
      const totalReposResult = await client.query(
        "SELECT COUNT(*) as count FROM repositories WHERE deleted_at IS NULL",
      );
      const totalRepos = parseInt(totalReposResult.rows[0].count);

      // Get deleted repositories count
      const deletedReposResult = await client.query(
        "SELECT COUNT(*) as count FROM repositories WHERE deleted_at IS NOT NULL",
      );
      const deletedRepos = parseInt(deletedReposResult.rows[0].count);

      // Get repositories by source
      const sourceStatsResult = await client.query(`
        SELECT unnest(source) as source, COUNT(*) as count
        FROM repositories
        WHERE deleted_at IS NULL
        GROUP BY unnest(source)
        ORDER BY count DESC
      `);
      const sourceStats = sourceStatsResult.rows;

      // Get top repositories by stars
      const topStarsResult = await client.query(`
        SELECT full_name, name, owner, stars, forks, url, source
        FROM repositories
        WHERE deleted_at IS NULL
        ORDER BY stars DESC
        LIMIT 10
      `);
      const topStars = topStarsResult.rows;

      // Get repositories added in last 7 days
      const recentReposResult = await client.query(`
        SELECT COUNT(*) as count
        FROM repositories
        WHERE deleted_at IS NULL AND created_at >= NOW() - INTERVAL '7 days'
      `);
      const recentRepos = parseInt(recentReposResult.rows[0].count);

      // Get repositories saved in last 7 days
      const recentSavedReposResult = await client.query(`
        SELECT COUNT(*) as count
        FROM repositories
        WHERE deleted_at IS NULL AND saved_at >= NOW() - INTERVAL '7 days'
      `);
      const recentSavedRepos = parseInt(recentSavedReposResult.rows[0].count);

      // Get daily saved counts for last 30 days
      const savedByDateResult = await client.query(`
        SELECT saved_at::date as date, COUNT(*) as count
        FROM repositories
        WHERE saved_at >= NOW() - INTERVAL '30 days'
        GROUP BY saved_at::date
        ORDER BY saved_at::date DESC
      `);
      const savedByDate = savedByDateResult.rows.map(row => ({
        date: row.date,
        count: parseInt(row.count),
      }));

      // Get total stars and forks
      const totalsResult = await client.query(`
        SELECT
          SUM(stars) as total_stars,
          SUM(forks) as total_forks
        FROM repositories
        WHERE deleted_at IS NULL
      `);
      const totals = totalsResult.rows[0];

      // Get repositories by owner (top 10)
      const topOwnersResult = await client.query(`
        SELECT owner, COUNT(*) as repo_count, SUM(stars) as total_stars
        FROM repositories
        WHERE deleted_at IS NULL
        GROUP BY owner
        ORDER BY repo_count DESC
        LIMIT 10
      `);
      const topOwners = topOwnersResult.rows;

      return NextResponse.json({
        totalRepos,
        deletedRepos,
        sourceStats,
        topStars,
        recentRepos,
        recentSavedRepos,
        savedByDate,
        totals: {
          totalStars: parseInt(totals.total_stars) || 0,
          totalForks: parseInt(totals.total_forks) || 0,
        },
        topOwners,
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Database error, falling back to mock data:", error);
    // Fall back to mock data if database connection fails
    return NextResponse.json(mockStats);
  } finally {
    try {
      await pool.end();
    } catch (endError) {
      // Ignore errors when closing pool
    }
  }
}
