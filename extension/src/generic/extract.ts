import type { FieldKind } from '@wf/shared';
import { clean, type ExtractedField } from '../ats/field';

// Oracle's single-choice pills: a role="list" of aria-pressed buttons, no radiogroup (live 2026-10-13).
const PILLS = '.cx-select-pills-container';
const CHOICES = `[role="radiogroup"],${PILLS}`;
const CONTROL = `input,select,textarea,[role="combobox"],${CHOICES}`;
const FILE_PROXY = /\b(attach|browse|upload)|\b(select|choose) (the |a )?(file|attachment)/i;
const SKIP_TYPES = new Set(['hidden', 'submit', 'button', 'reset', 'image', 'search', 'password']);
const BOX = `fieldset,[role="group"],${CHOICES}`;

export type Skip = (el: HTMLElement) => boolean;

export interface Discovered { container: HTMLElement; label: string; kind: FieldKind; required: boolean; options?: string[]; members?: HTMLElement[] }

function isControl(el: HTMLElement, skip?: Skip, hiddenFileOk = false, ariaHidden = false): boolean {
  if (el.closest(ariaHidden ? '[hidden]' : '[hidden],[aria-hidden="true"]') || skip?.(el)) return false;
  // Sites keep a helper input in the markup and toggle it with an inline display:none. A drop zone's file input is hidden
  // that way too (live Gem, Breezy): taken when it is the form's only way to attach a file.
  if (el.style.display === 'none' && !(hiddenFileOk && el.matches('input[type="file"]'))) return false;
  if ((el as HTMLInputElement).disabled) return false;
  // A read-only box that only shows the chosen file's name stands in for the file input beside it (live Manatal).
  if (el instanceof HTMLInputElement && el.readOnly && FILE_PROXY.test(`${el.placeholder} ${el.getAttribute('aria-label') ?? ''}`)) return false;
  // Ant Design's select is a type="search" input (live Dayforce); elsewhere a search box is a page filter, not a field.
  if (el instanceof HTMLInputElement && SKIP_TYPES.has(el.type) && !(el.type === 'search' && el.closest('.ant-select'))) return false;
  // The text box of an ARIA 1.1 combobox and the radios of a radiogroup belong to their wrapper.
  return !el.parentElement?.closest(`[role="combobox"],${CHOICES}`);
}

// Checkboxes in a box (fieldset, role="group", or one the site calls a checkbox group: live JobScore
// "js-checkbox-question", each box with its own name) that holds nothing else are one question (live Oracle races).
const boxTokens = new WeakMap<Element, object>();
const CHECKBOX_BOX = 'fieldset,[role="group"],[class*="checkbox-question"],[class*="checkbox-group"]';
function checkboxBox(el: HTMLInputElement): object | null {
  const box = el.closest(CHECKBOX_BOX);
  if (!box || box.querySelector('input:not([type="checkbox"]):not([type="hidden"]),select,textarea,[role="combobox"]')) return null;
  if (!boxTokens.has(box)) boxTokens.set(box, {});
  return boxTokens.get(box)!;
}

// Nameless radios (live Gem) are one question: the nearest box that holds several of them and nothing else.
function siblingBox(el: HTMLInputElement): Element | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const controls = [...p.querySelectorAll('input:not([type="hidden"]),select,textarea,[role="combobox"]')];
    if (controls.some((c) => !(c instanceof HTMLInputElement && c.type === el.type && !c.name))) return null;
    if (controls.length > 1) return p;
  }
  return null;
}

const groupKey = (el: HTMLElement): unknown => {
  if (!(el instanceof HTMLInputElement) || (el.type !== 'radio' && el.type !== 'checkbox')) return el;
  if (el.type === 'checkbox' && el.closest('[class*="checkbox-question"],[class*="checkbox-group"]')) return checkboxBox(el) ?? el;
  if (el.name) return `${el.type}:${el.name}`;
  // Not checkboxes: nameless ones side by side are often separate consents (live Oracle).
  return (el.type === 'checkbox' ? checkboxBox(el) : siblingBox(el)) || el;
};

// Sites spell the flag out in the label: "Email (required)", "Phone (optional)", or a screen-reader "Required" glued to
// the end ("First nameRequired", live Teamtailor). Only glued or bracketed: "Is sponsorship required" is a question.
const FLAG = /\s*\((?:required|optional)\)\s*|(?<=[a-z?.:)*])Required\s*$/gi;
const flaggedRequired = (raw: string) => /\(required\)|(?<=[a-z?.:)*])required\s*$/i.test(raw);
const unflag = (raw: string) => raw.replace(FLAG, ' ');

// Ids resolve inside the element's own tree: a form in a shadow root (live UKG) labels its fields there.
type Scope = ParentNode & { getElementById(id: string): HTMLElement | null };
const scopeOf = (el: Element) => el.getRootNode() as unknown as Scope;

/** Every open shadow root under `n`, however deep. */
export function shadowRoots(n: ParentNode, out: ShadowRoot[] = []): ShadowRoot[] {
  for (const e of n.querySelectorAll('*')) if (e.shadowRoot) { out.push(e.shadowRoot); shadowRoots(e.shadowRoot, out); }
  return out;
}

function byIds(el: Element, attr: string): string {
  const doc = scopeOf(el);
  return (el.getAttribute(attr) ?? '').split(/\s+/).filter(Boolean).map((id) => doc.getElementById(id)?.textContent ?? '').join(' ');
}

function labelFor(el: HTMLElement): HTMLElement | null {
  const doc = scopeOf(el);
  const by = el.getAttribute('aria-labelledby')?.split(/\s+/)[0];
  const l = by ? doc.getElementById(by) : null;
  const f = el.id ? doc.querySelector<HTMLElement>(`label[for="${CSS.escape(el.id)}"]`) : null;
  // iCIMS lists a screen-reader-only duplicate ("My Computer (Opens new window)") first; the visible label is the for= one.
  if (l && !(f && l.closest('[aria-hidden="true"]') && !f.closest('[aria-hidden="true"]'))) return l;
  return f ?? el.closest('label');
}

/** Label text without any control nested in it (a wrapped select would leak its options). */
function textOf(el: Element | null | undefined): string {
  if (!el) return '';
  const copy = el.cloneNode(true) as HTMLElement;
  // A label wrapping the whole widget (live Paylocity) also holds its shown value and option labels: when it has text of
  // its own beside the part holding the control, that text is the label.
  const outside = copy.cloneNode(true) as HTMLElement;
  [...outside.children].forEach((c) => { if (c.querySelector('input,select,textarea,[role="combobox"],[role="radiogroup"]')) c.remove(); });
  if (outside.children.length < copy.children.length && clean(outside.textContent)) return outside.textContent ?? '';
  copy.querySelectorAll('input,select,textarea').forEach((e) => e.remove());
  return copy.textContent ?? '';
}

// Words a widget uses for itself, not the question it asks (live Rippling: aria-label="Select"; Paylocity: "--").
const PROMPT = /^(select|search|choose|please select|select an option|--+)\.*$/i;
const meaningful = (s: string | null | undefined) => (s && clean(s) && !PROMPT.test(clean(s)) ? s : '');

const choiceLabel = (el: HTMLElement) => clean(textOf(labelFor(el))) || clean(el.getAttribute('aria-label')) || clean(el.textContent);

const legendOf = (box: HTMLElement) => [...box.children].find((e) => e.tagName === 'LEGEND');

function boxLabel(box: HTMLElement): string {
  return legendOf(box)?.textContent ?? (byIds(box, 'aria-labelledby') || box.getAttribute('aria-label') || '');
}

/** Sites like Oracle mark required with a class on the label (or a child of it), not with a star. */
const REQUIRED_CLASS = '[class*="required" i]';
// aria-labelledby often points at a span inside the <label> that carries the class.
const flagged = (el: Element | null | undefined) => {
  const l = el?.closest('label') ?? el;
  return !!l && (l.matches(REQUIRED_CLASS) || !!l.querySelector(REQUIRED_CLASS));
};

function requiredLabel(
  first: HTMLElement, members: HTMLElement[], ownBox: HTMLElement | null, lab: HTMLElement | null,
  groupsIn: (n: Element) => number, root: ParentNode,
): boolean {
  const doc = scopeOf(first);
  const named = ownBox
    ? [legendOf(ownBox), ...(ownBox.getAttribute('aria-labelledby') ?? '').split(/\s+/).map((id) => doc.getElementById(id))]
    : [lab];
  if (named.some(flagged)) return true;
  if (named.some(Boolean)) return false;
  // Labelled only by aria-label: the visible <label> sits beside the control, inside the nearest wrapper that holds just this field.
  let wrap: HTMLElement = first;
  for (let p = first.parentElement; p && p !== root && groupsIn(p) <= 1; p = p.parentElement) wrap = p;
  const ids = new Set(members.map((m) => m.id).filter(Boolean));
  return wrap !== first && [...wrap.querySelectorAll('label')].some((l) => !l.querySelector('input,select,textarea') && !ids.has(l.htmlFor) && flagged(l));
}

/** A group's question when it has no legend: the container's text minus the controls and their option labels. */
function leftoverText(container: HTMLElement, members: HTMLElement[]): string {
  const ids = new Set(members.map((m) => m.id).filter(Boolean));
  const copy = container.cloneNode(true) as HTMLElement;
  copy.querySelectorAll('label').forEach((l) => {
    if (l.querySelector('input,select,textarea') || ids.has(l.htmlFor)) l.remove();
  });
  // Buttons beside a field ("+" to add a link, live Freshteam) name an action, not the question.
  copy.querySelectorAll('input,select,textarea,button,[role="button"],[role="radio"],[role="option"]').forEach((e) => e.remove());
  // Hidden error messages (Angular's ng-hide, live Breezy) and a drop zone's own prompt are not the question.
  copy.querySelectorAll('[hidden],.ng-hide,[style*="display: none"],[style*="display:none"]').forEach((e) => e.remove());
  copy.querySelectorAll('*').forEach((e) => { if ([...e.children].every((c) => !clean(c.textContent)) && (DROP_PROMPT.test(clean(e.textContent)) || PROMPT.test(clean(e.textContent)))) e.remove(); });
  return copy.textContent ?? '';
}
// A drop zone with no text of its own (live Breezy: name="cResume") is named by what the site calls the input.
const fileName = (el: HTMLElement) => { const n = `${el.id} ${el.getAttribute('name') ?? ''}`; return /resume|\bcv\b/i.test(n) ? 'Resume' : /cover/i.test(n) ? 'Cover letter' : ''; };
const DROP_PROMPT = /^(click|tap) to upload|drag (and|&) drop|^drop or select|^total \d+ files? selected|^no file chosen|^attach a file|^drop (your )?(\w+ )?files? here|^(browse|select|choose) files?$/i;

function kindOf(el: HTMLElement): FieldKind {
  // The property, not the attribute: live Rippling writes type=File.
  if (el instanceof HTMLInputElement && el.type === 'file') return 'file';
  if (el.matches('select,[role="combobox"]')) return 'select';
  if (el.matches(`input[type="radio"],${CHOICES}`)) return 'radio';
  if (el.matches('input[type="checkbox"]')) return 'checkbox';
  if (el.matches('textarea')) return 'textarea';
  if (el.matches('input[type="date"],input[type="month"]')) return 'date';
  return 'text';
}

/** One question per wrapper, named by the site's own label element (Lever, Tesla): the wrapper's controls are one field. */
export function wrapperField(w: HTMLElement, rawLabel: string, optionText: (el: HTMLElement) => string = choiceLabel): Discovered | null {
  const members = [...w.querySelectorAll<HTMLElement>('input,select,textarea')].filter((el) => isControl(el));
  const first = members[0];
  if (!first) return null;
  const kind = kindOf(first);
  const d: Discovered = {
    container: w, label: clean(unflag(rawLabel)), kind,
    required: rawLabel.includes('*') || flaggedRequired(rawLabel) || members.some((m) => m.matches('[required],[aria-required="true"]')),
  };
  if (kind === 'radio' || (kind === 'checkbox' && members.length > 1)) { d.options = members.map(optionText); d.members = members; }
  return d;
}

// The applicant must be able to see a field for it to be filled: hidden fields would take profile data, EEO answers
// and the resume unseen. The container is tested, not the control: sites hide styled radios and file inputs behind a label.
const rendered = (c: HTMLElement): boolean => {
  if (c.checkVisibility && !c.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false;
  const r = c.getBoundingClientRect(); // page coordinates, so a field scrolled past still counts
  return !(r.width || r.height) || (r.right + scrollX > 0 && r.bottom + scrollY > 0); // no box at all: no layout to judge (display: contents)
};

/** How much of what a page hides still counts as a field.
 *  `keepHidden`: for an adapter that reads hidden rows on purpose and checks them itself before filling (ADP's `asked`).
 *  `hiddenFiles`: a display:none file input counts when the form has no other (a drop zone's; adapters that read their
 *  own resume box leave it off).
 *  `ariaHidden`: fields under aria-hidden="true" count (live Paycom marks its whole on-screen form so). */
export interface Reach { keepHidden?: boolean; hiddenFiles?: boolean; ariaHidden?: boolean }

export function discoverFields(root: ParentNode, skip?: Skip, reach: Reach = {}): Discovered[] {
  const { keepHidden = false, hiddenFiles = false, ariaHidden = false } = reach;
  const groups = new Map<unknown, HTMLElement[]>();
  const hiddenFileOk = hiddenFiles && ![...root.querySelectorAll<HTMLElement>('input[type="file"]')].some((f) => f.style.display !== 'none');
  for (const el of root.querySelectorAll<HTMLElement>(CONTROL)) {
    if (!isControl(el, skip, hiddenFileOk, ariaHidden)) continue;
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
    if (!keepHidden && !rendered(container === first ? (lab ?? first.parentElement ?? first) : container)) continue;
    const kind = kindOf(first);
    const isGroup = members.length > 1 || kind === 'radio';
    // Last resort before the placeholder: the nearest text beside the control, in a wrapper that holds only this field
    // (live Gem: a <span> above the box, tied to it by nothing).
    let near = '';
    for (let w: HTMLElement | null = container === first ? first.parentElement : container; w && w !== root && groupsIn(w) <= 1 && !clean(meaningful(near)); w = w.parentElement) near = leftoverText(w, members);
    // A drop zone's <label> is often just its prompt ("Drop or select", live Rippling); the question is beside it.
    // Then the <label for> if the zone has one (live Homerun: aria-labelledby names the prompt, the <label> the question).
    const forLabel = () => (first.id ? scopeOf(first).querySelector(`label[for="${CSS.escape(first.id)}"]`) : null);
    const labText = kind === 'file' && DROP_PROMPT.test(clean(textOf(lab))) ? textOf(forLabel() === lab ? null : forLabel()) : textOf(lab);
    const rawLabel = (ownBox && boxLabel(ownBox)) || labText || meaningful(first.getAttribute('aria-label')) || meaningful(near)
      || meaningful(first.getAttribute('placeholder')) || (kind === 'file' ? fileName(first) : '');
    // Name parts under one "Name" label say only "First" / "Last" (live Personio). The federal disability form (CC-305)
    // labels only its choices; the question sits above them in text tied to nothing (live JazzHR).
    const label = clean(unflag(rawLabel)).replace(/^(first|last|middle|given|family)$/i, '$1 name')
      || (kind === 'radio' && members.some((m) => /\bI (?:have|do not have) a disability\b/i.test(choiceLabel(m))) ? 'Disability status' : '');
    if (!label) continue;
    const d: Discovered = {
      container, label, kind,
      required: rawLabel.includes('*') || flaggedRequired(rawLabel) || members.some((m) => m.matches('[required],[aria-required="true"]')) || container.matches('[aria-required="true"]')
        || requiredLabel(first, members, ownBox, lab, groupsIn, root),
    };
    if (kind === 'radio') {
      // A role="radio" wrapper around a native radio is one option, not two (live Workable); the native one names it.
      const items = first.matches(CHOICES)
        ? [...container.querySelectorAll<HTMLElement>('input[type="radio"],[role="radio"],button[aria-pressed]')].filter((m) => !(m.matches('[role="radio"]') && m.querySelector('input[type="radio"]')))
        : members;
      d.options = items.map(choiceLabel);
      d.members = items;
      if (items.some((m) => m.matches('[required],[aria-required="true"]'))) d.required = true; // live Eightfold: aria-required radios
    } else if (kind === 'checkbox' && members.length > 1) {
      d.options = members.map(choiceLabel);
      d.members = members;
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

export interface GenericOptions extends Reach { sectionOf?: (container: HTMLElement) => string | undefined; skip?: Skip }

export function extractGeneric(root: ParentNode, opts: GenericOptions = {}): ExtractedField[] {
  const sectionOf = opts.sectionOf ?? headingBefore;
  const seen = new Map<string, number>();
  return discoverFields(root, opts.skip, opts).map((d, i) => {
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
    if (d.members) f.members = d.members;
    // react-select marks the box that holds several choices (live Greenhouse: "Which locations are you open to").
    if (d.kind === 'select' && d.container.querySelector('[class*="is-multi"],[aria-multiselectable="true"]')) f.multi = true;
    return f;
  });
}
