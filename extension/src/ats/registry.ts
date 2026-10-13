import type { AtsAdapter } from './types';
import { workday } from '../workday/adapter';
import { greenhouse } from '../greenhouse/adapter';
import { icims } from '../icims/adapter';
import { oracle } from '../oracle/adapter';
import { successfactors } from '../successfactors/adapter';

const ADAPTERS: AtsAdapter[] = [workday, greenhouse, icims, oracle, successfactors];

export const pickAdapter = (url: URL): AtsAdapter | null => ADAPTERS.find((a) => a.detect(url)) ?? null;
