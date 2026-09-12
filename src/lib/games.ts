import { and, asc, count, eq, inArray } from 'drizzle-orm';
import type { Database } from './db';
import { games, categories, publishers } from '../../db/schema';
import type { Game } from '../types/game';

const gameSelection = {
    id: games.id,
    title: games.title,
    description: games.description,
    starRating: games.starRating,
    categoryId: categories.id,
    categoryName: categories.name,
    publisherId: publishers.id,
    publisherName: publishers.name,
};

type GameSelectionRow = {
    id: number;
    title: string;
    description: string;
    starRating: number | null;
    categoryId: number | null;
    categoryName: string | null;
    publisherId: number | null;
    publisherName: string | null;
};

function mapGame(row: GameSelectionRow): Game {
    return {
        id: row.id,
        title: row.title,
        description: row.description,
        starRating: row.starRating,
        category:
            row.categoryId !== null && row.categoryName !== null
                ? { id: row.categoryId, name: row.categoryName }
                : null,
        publisher:
            row.publisherId !== null && row.publisherName !== null
                ? { id: row.publisherId, name: row.publisherName }
                : null,
    };
}

function baseGamesQuery(db: Database) {
    return db
        .select(gameSelection)
        .from(games)
        .leftJoin(categories, eq(games.categoryId, categories.id))
        .leftJoin(publishers, eq(games.publisherId, publishers.id));
}

export interface GameFilters {
    categoryIds?: number[];
    publisherId?: number;
}

export const DEFAULT_GAME_PAGE_SIZE = 6;

export interface GamePageOptions extends GameFilters {
    page?: number;
    pageSize?: number;
}

export interface GamePage {
    games: Game[];
    page: number;
    pageSize: number;
    totalGames: number;
    totalPages: number;
    hasPreviousPage: boolean;
    hasNextPage: boolean;
}

function buildGameConditions(filters: GameFilters) {
    const conditions = [];
    if (filters.categoryIds && filters.categoryIds.length > 0) {
        conditions.push(inArray(games.categoryId, filters.categoryIds));
    }
    if (filters.publisherId !== undefined) {
        conditions.push(eq(games.publisherId, filters.publisherId));
    }
    return conditions;
}

/** All games ordered by title. */
export async function getAllGames(db: Database, filters: GameFilters = {}): Promise<Game[]> {
    const conditions = buildGameConditions(filters);
    const query = baseGamesQuery(db);
    const rows = await (conditions.length > 0 ? query.where(and(...conditions)) : query).orderBy(asc(games.title));
    return rows.map(mapGame);
}

/** A stable, filter-aware page of games ordered by title. */
export async function getGamesPage(db: Database, options: GamePageOptions = {}): Promise<GamePage> {
    const pageSize = Number.isInteger(options.pageSize) && options.pageSize !== undefined && options.pageSize > 0
        ? options.pageSize
        : DEFAULT_GAME_PAGE_SIZE;
    const requestedPage = Number.isInteger(options.page) && options.page !== undefined && options.page > 0
        ? options.page
        : 1;
    const conditions = buildGameConditions(options);
    const countQuery = db.select({ count: count() }).from(games);
    const countRows = await (conditions.length > 0 ? countQuery.where(and(...conditions)) : countQuery);
    const totalGames = Number(countRows[0]?.count ?? 0);
    const totalPages = Math.ceil(totalGames / pageSize);
    const page = totalPages > 0 ? Math.min(requestedPage, totalPages) : 1;
    const query = baseGamesQuery(db);
    const rows = await (conditions.length > 0 ? query.where(and(...conditions)) : query)
        .orderBy(asc(games.title))
        .limit(pageSize)
        .offset((page - 1) * pageSize);

    return {
        games: rows.map(mapGame),
        page,
        pageSize,
        totalGames,
        totalPages,
        hasPreviousPage: page > 1,
        hasNextPage: page < totalPages,
    };
}

/** All game ids ordered by title. */
export async function getAllGameIds(db: Database): Promise<number[]> {
    const rows = await db.select({ id: games.id }).from(games).orderBy(asc(games.title));
    return rows.map((row) => row.id);
}

/** A single game by id, or null when it does not exist. */
export async function getGameById(db: Database, id: number): Promise<Game | null> {
    const row = await baseGamesQuery(db).where(eq(games.id, id)).get();
    return row ? mapGame(row) : null;
}
