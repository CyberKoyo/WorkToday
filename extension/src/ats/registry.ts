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
import { lever } from '../lever/adapter';
import { tesla } from '../tesla/adapter';
import { dayforce } from '../dayforce/adapter';
import { smartrecruiters } from '../smartrecruiters/adapter';

const ADAPTERS: AtsAdapter[] = [workday, greenhouse, icims, oracle, successfactors, ashby, adp, adpTax, eightfold, phenom, lever, tesla, smartrecruiters, dayforce];

// Only over https: on a cleartext page a network attacker writes the document, and the Workday adapter types the saved password.
export const pickAdapter = (url: URL): AtsAdapter | null => (url.protocol === 'https:' && ADAPTERS.find((a) => a.detect(url))) || null;
