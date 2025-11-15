import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";

// Generate mock repositories (deterministic for consistent styling tests)
const generateMockRepositories = () => {
  const owners = [
    "scaffold-eth",
    "awesome-dev",
    "crypto-builder",
    "web3-developer",
    "ethereum-dev",
    "blockchain-studio",
    "defi-labs",
    "crypto-innovator",
    "web3-wizard",
    "ethereum-builder",
    "dapp-creator",
    "smart-contract-dev",
    "nft-artist",
    "defi-protocol",
    "dao-builder",
  ];

  const projectNames = [
    "scaffold-eth-2",
    "defi-protocol",
    "nft-marketplace",
    "token-factory",
    "dapp-template",
    "dao-governance",
    "lending-protocol",
    "staking-platform",
    "multi-sig-wallet",
    "contract-library",
    "vault-manager",
    "swap-protocol",
    "bridge-contract",
    "oracle-service",
    "identity-system",
    "payment-gateway",
    "auction-house",
    "governance-tool",
    "treasury-manager",
    "voting-system",
  ];

  const repos: any[] = [];
  let id = 1;
  const baseDate = Date.now();

  // Simple deterministic "random" function using seed
  const seededRandom = (seed: number) => {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
  };

  for (let i = 0; i < 150; i++) {
    const seed = i * 7 + 13; // Deterministic seed based on index
    const owner = owners[Math.floor(seededRandom(seed) * owners.length)];
    const name = projectNames[Math.floor(seededRandom(seed + 1) * projectNames.length)];
    const fullName = `${owner}/${name}-${i}`;
    const stars = Math.floor(seededRandom(seed + 2) * 10000) + 10;
    const forks = Math.floor(stars * 0.3);
    const createdAt = new Date(baseDate - seededRandom(seed + 3) * 365 * 24 * 60 * 60 * 1000).toISOString();
    const updatedAt = new Date(baseDate - seededRandom(seed + 4) * 30 * 24 * 60 * 60 * 1000).toISOString();
    const lastSeen = new Date(baseDate - seededRandom(seed + 5) * 7 * 24 * 60 * 60 * 1000).toISOString();
    const savedAt = new Date().toISOString();

    repos.push({
      id: id++,
      full_name: fullName,
      name: `${name}-${i}`,
      owner: owner,
      url: `https://github.com/${fullName}`,
      homepage: seededRandom(seed + 6) > 0.5 ? `https://${name}.app` : null,
      stars: stars,
      forks: forks,
      created_at: createdAt,
      updated_at: updatedAt,
      last_seen: lastSeen,
      saved_at: savedAt,
      source: seededRandom(seed + 7) > 0.5 ? ["github"] : ["github", "npm"],
    });
  }

  return repos;
};

const mockRepositories = generateMockRepositories();

// Helper function to process mock data with pagination, sorting, and search
const processMockData = (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "30");
  const sortBy = searchParams.get("sortBy") || "id";
  const sortOrder = searchParams.get("sortOrder") || "desc";
  const search = searchParams.get("search") || "";

  // Filter by search
  let filtered = mockRepositories;
  if (search) {
    const searchLower = search.toLowerCase();
    filtered = mockRepositories.filter(
      repo =>
        repo.full_name.toLowerCase().includes(searchLower) ||
        repo.name.toLowerCase().includes(searchLower) ||
        repo.owner.toLowerCase().includes(searchLower),
    );
  }

  // Sort
  filtered.sort((a, b) => {
    let aVal: any = a[sortBy as keyof typeof a];
    let bVal: any = b[sortBy as keyof typeof b];

    if (sortBy === "created_at" || sortBy === "updated_at" || sortBy === "last_seen") {
      aVal = new Date(aVal).getTime();
      bVal = new Date(bVal).getTime();
    }

    if (aVal < bVal) return sortOrder === "asc" ? -1 : 1;
    if (aVal > bVal) return sortOrder === "asc" ? 1 : -1;
    return 0;
  });

  // Paginate
  const totalCount = filtered.length;
  const totalPages = Math.ceil(totalCount / limit);
  const offset = (page - 1) * limit;
  const paginated = filtered.slice(offset, offset + limit);

  return NextResponse.json({
    repositories: paginated,
    pagination: {
      currentPage: page,
      totalPages,
      totalCount,
      limit,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
    sorting: {
      sortBy,
      sortOrder,
    },
    search,
  });
};

export async function GET(request: NextRequest) {
  // Check if database connection string is available
  if (!process.env.POSTGRES_URL) {
    console.log("No POSTGRES_URL found, using mock data");
    return processMockData(request);
  }

  const pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
  });

  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "30");
    const sortBy = searchParams.get("sortBy") || "id";
    const sortOrder = searchParams.get("sortOrder") || "desc";
    const search = searchParams.get("search") || "";

    const offset = (page - 1) * limit;

    // Validate sortBy parameter
    const allowedSortFields = ["id", "stars", "forks", "name", "owner", "created_at", "updated_at", "last_seen"];
    const validSortBy = allowedSortFields.includes(sortBy) ? sortBy : "id";
    const validSortOrder = sortOrder.toLowerCase() === "asc" ? "ASC" : "DESC";

    const client = await pool.connect();

    try {
      // Build the WHERE clause for search
      let whereClause = "";
      const queryParams: any[] = [];

      if (search) {
        whereClause = "WHERE (full_name ILIKE $1 OR name ILIKE $1 OR owner ILIKE $1) AND deleted_at IS NULL";
        queryParams.push(`%${search}%`);
      } else {
        whereClause = "WHERE deleted_at IS NULL";
      }

      // Get total count for pagination
      const countQuery = `SELECT COUNT(*) as count FROM repositories ${whereClause}`;
      const countResult = await client.query(countQuery, queryParams);
      const totalCount = parseInt(countResult.rows[0].count);

      // Get repositories with pagination and sorting
      let repositoriesQuery: string;
      let repositoriesParams: any[];

      if (search) {
        // With search parameters
        repositoriesQuery = `
          SELECT
            id, full_name, name, owner, url, homepage, stars, forks,
            created_at, updated_at, last_seen, saved_at, source
          FROM repositories
          WHERE (full_name ILIKE $1 OR name ILIKE $1 OR owner ILIKE $1) AND deleted_at IS NULL
          ORDER BY ${validSortBy} ${validSortOrder} NULLS LAST
          LIMIT $2 OFFSET $3
        `;
        repositoriesParams = [`%${search}%`, limit, offset];
      } else {
        // Without search parameters
        repositoriesQuery = `
          SELECT
            id, full_name, name, owner, url, homepage, stars, forks,
            created_at, updated_at, last_seen, saved_at, source
          FROM repositories
          WHERE deleted_at IS NULL
          ORDER BY ${validSortBy} ${validSortOrder} NULLS LAST
          LIMIT $1 OFFSET $2
        `;
        repositoriesParams = [limit, offset];
      }

      const repositoriesResult = await client.query(repositoriesQuery, repositoriesParams);

      const totalPages = Math.ceil(totalCount / limit);

      return NextResponse.json({
        repositories: repositoriesResult.rows,
        pagination: {
          currentPage: page,
          totalPages,
          totalCount,
          limit,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
        sorting: {
          sortBy: validSortBy,
          sortOrder: validSortOrder.toLowerCase(),
        },
        search,
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Database error, falling back to mock data:", error);
    // Fall back to mock data if database connection fails
    return processMockData(request);
  } finally {
    try {
      await pool.end();
    } catch (endError) {
      // Ignore errors when closing pool
    }
  }
}
