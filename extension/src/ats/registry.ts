import type { AtsAdapter } from './types';
import { workday } from '../workday/adapter';

const ADAPTERS: AtsAdapter[] = [workday];

export const pickAdapter = (url: URL): AtsAdapter | null => ADAPTERS.find((a) => a.detect(url)) ?? null;
