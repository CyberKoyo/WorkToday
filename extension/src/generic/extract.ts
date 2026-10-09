import type { FieldKind } from '@wf/shared';
import { clean, type ExtractedField } from '../ats/field';

const CONTROL = 'input,select,textarea,[role="combobox"],[role="radiogroup"]';
const SKIP_TYPES = new Set(['hidden', 'submit', 'button', 'reset', 'image', 'search', 'password']);
const BOX = 'fieldset,[role="group"],[role="radiogroup"]';

export interface Discovered { container: HTMLElement; label: string; kind: FieldKind; required: boolean; options?: string[] }

function isControl(el: HTMLElement): boolean {
  if (el.closest('[hidden],[aria-hidden="true"]')) return false;
  if (el instanceof HTMLInputElement && SKIP_TYPES.has(el.type)) return false;
  // The text box of an ARIA 1.1 combobox and the radios of a radiogroup belong to their wrapper.
  return !el.parentElement?.closest('[role="combobox"],[role="radiogroup"]');
}

const groupKey = (el: HTMLElement): unknown =>
  el instanceof HTMLInputElement && (el.type === 'radio' || el.type === 'checkbox') && el.name ? `${el.type}:${el.name}` : el;

function byIds(el: Element, attr: string): string {
  const doc = el.ownerDocument;
  return (el.getAttribute(attr) ?? '').split(/\s+/).filter(Boolean).map((id) => doc.getElementById(id)?.textContent ?? '').join(' ');
}

function labelFor(el: HTMLElement): HTMLElement | null {
  const doc = el.ownerDocument;
  const by = el.getAttribute('aria-labelledby')?.split(/\s+/)[0];
  const l = by ? doc.getElementById(by) : null;
  if (l) return l;
  if (el.id) {
    const f = doc.querySelector<HTMLElement>(`label[for="${CSS.escape(el.id)}"]`);
    if (f) return f;
  }
  return el.closest('label');
}

/** Label text without any control nested in it (a wrapped select would leak its options). */
function textOf(el: Element | null | undefined): string {
  if (!el) return '';
  const copy = el.cloneNode(true) as HTMLElement;
  copy.querySelectorAll('input,select,textarea').forEach((e) => e.remove());
  return copy.textContent ?? '';
}

const choiceLabel = (el: HTMLElement) => clean(textOf(labelFor(el))) || clean(el.getAttribute('aria-label')) || clean(el.textContent);

function boxLabel(box: HTMLElement): string {
  const legend = [...box.children].find((e) => e.tagName === 'LEGEND');
  return legend?.textContent ?? (byIds(box, 'aria-labelledby') || box.getAttribute('aria-label') || '');
}

/** A group's question when it has no legend: the container's text minus the controls and their option labels. */
function leftoverText(container: HTMLElement, members: HTMLElement[]): string {
  const ids = new Set(members.map((m) => m.id).filter(Boolean));
  const copy = container.cloneNode(true) as HTMLElement;
  copy.querySelectorAll('label').forEach((l) => {
    if (l.querySelector('input,select,textarea') || ids.has(l.htmlFor)) l.remove();
  });
  copy.querySelectorAll('input,select,textarea,[role="radio"],[role="option"]').forEach((e) => e.remove());
  return copy.textContent ?? '';
}

function kindOf(el: HTMLElement): FieldKind {
  if (el.matches('input[type="file"]')) return 'file';
  if (el.matches('select,[role="combobox"]')) return 'select';
  if (el.matches('input[type="radio"],[role="radiogroup"]')) return 'radio';
  if (el.matches('input[type="checkbox"]')) return 'checkbox';
  if (el.matches('textarea')) return 'textarea';
  if (el.matches('input[type="date"],input[type="month"]')) return 'date';
  return 'text';
}

export function discoverFields(root: ParentNode): Discovered[] {
  const groups = new Map<unknown, HTMLElement[]>();
  for (const el of root.querySelectorAll<HTMLElement>(CONTROL)) {
    if (!isControl(el)) continue;
    const k = groupKey(el);
    groups.set(k, [...(groups.get(k) ?? []), el]);
  }
  const owner = new Map<Element, number>();
  const list = [...groups.values()];
  list.forEach((members, i) => members.forEach((m) => owner.set(m, i)));
  const groupsIn = (node: Element) => new Set([...node.querySelectorAll(CONTROL)].flatMap((e) => (owner.has(e) ? [owner.get(e)] : []))).size;

  const out: Discovered[] = [];
  for (const members of list) {
    const first = members[0]!;
    const covers = (n: Element) => members.every((m) => n.contains(m));
    const box = first.closest<HTMLElement>(BOX);
    const ownBox = box && covers(box) && groupsIn(box) <= 1 ? box : null;
    const lab = members.length === 1 ? labelFor(first) : null;
    let container: HTMLElement | null = ownBox;
    if (!container) {
      let c = first.parentElement ?? first;
      // A parent that is the root or already holds other groups can't be this control's container.
      if (c === root || (members.length === 1 && groupsIn(c) > 1)) c = first;
      while (c !== first && !(covers(c) && (!lab || c.contains(lab)))) {
        const p = c.parentElement;
        if (!p || p === root || groupsIn(p) > 1) break;
        c = p;
      }
      container = c === root ? first : c;
    }
    const kind = kindOf(first);
    const isGroup = members.length > 1 || kind === 'radio';
    const rawLabel = (ownBox && boxLabel(ownBox)) || textOf(lab) || first.getAttribute('aria-label')
      || (isGroup ? leftoverText(container, members) : '') || first.getAttribute('placeholder') || '';
    const label = clean(rawLabel);
    if (!label) continue;
    const d: Discovered = {
      container, label, kind,
      required: rawLabel.includes('*') || members.some((m) => m.matches('[required],[aria-required="true"]')) || container.matches('[aria-required="true"]'),
    };
    if (kind === 'radio') {
      const items = first.matches('[role="radiogroup"]') ? [...container.querySelectorAll<HTMLElement>('input[type="radio"],[role="radio"]')] : members;
      d.options = items.map(choiceLabel);
    } else if (kind === 'checkbox' && members.length > 1) {
      d.options = members.map(choiceLabel);
    }
    out.push(d);
  }
  return out;
}

export function headingBefore(c: HTMLElement): string | undefined {
  let found: Element | undefined;
  for (const h of c.ownerDocument.querySelectorAll('h1,h2,h3,h4,[role="heading"]')) {
    if (h.contains(c)) continue;
    if (h.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING) found = h; else break;
  }
  return clean(found?.textContent) || undefined;
}

export interface GenericOptions { sectionOf?: (container: HTMLElement) => string | undefined }

export function extractGeneric(root: ParentNode, opts: GenericOptions = {}): ExtractedField[] {
  const sectionOf = opts.sectionOf ?? headingBefore;
  const seen = new Map<string, number>();
  return discoverFields(root).map((d, i) => {
    const id = `wf-${i}`;
    d.container.dataset.wfId = id;
    const section = sectionOf(d.container);
    const n = section?.match(/(\d+)\s*$/);
    const key = `${section ?? ''}|${d.label}`;
    const nth = seen.get(key) ?? 0;
    seen.set(key, nth + 1);
    const f: ExtractedField = { id, label: d.label, kind: d.kind, required: d.required, groupIndex: n ? Number(n[1]) - 1 : nth, container: d.container };
    if (section) f.section = section;
    if (d.options) f.options = d.options;
    return f;
  });
}
