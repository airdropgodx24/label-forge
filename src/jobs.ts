import type { DashboardJob } from "../core/src/session";
import { sampleJobEntry as imagePreferenceEntry } from "../apps/image-preference/src";
import { sampleJobEntry as responseRankingEntry } from "../apps/response-ranking/src";

/**
 * The jobs the site offers: each app's bundled sample job, exactly as the app
 * exports it. Built once, because the core's shell needs a stable task list.
 */
export const JOBS: readonly DashboardJob[] = [imagePreferenceEntry(), responseRankingEntry()];
