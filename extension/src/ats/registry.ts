import type { AtsAdapter } from './types';
import { workday } from '../workday/adapter';
import { greenhouse } from '../greenhouse/adapter';
import { icims } from '../icims/adapter';
import { oracle } from '../oracle/adapter';
import { successfactors } from '../successfactors/adapter';
import { ashby } from '../ashby/adapter';
import { adp } from '../adp/adapter';
import { adpTax } from '../adp/tax';
import { eightfold } from '../eightfold/adapter';
import { phenom } from '../phenom/adapter';

const ADAPTERS: AtsAdapter[] = [workday, greenhouse, icims, oracle, successfactors, ashby, adp, adpTax, eightfold, phenom];

export const pickAdapter = (url: URL): AtsAdapter | null => ADAPTERS.find((a) => a.detect(url)) ?? null;
