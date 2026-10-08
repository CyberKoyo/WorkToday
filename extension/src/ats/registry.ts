import type { AtsAdapter } from './types';
import { workday } from '../workday/adapter';
import { greenhouse } from '../greenhouse/adapter';
import { icims } from '../icims/adapter';

const ADAPTERS: AtsAdapter[] = [workday, greenhouse, icims];

export const pickAdapter = (url: URL): AtsAdapter | null => ADAPTERS.find((a) => a.detect(url)) ?? null;
