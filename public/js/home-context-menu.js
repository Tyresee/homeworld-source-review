let contextMenuSequence = 0;

const node = (tag, className, text) => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
};
const makeButton = (label, className, action) => {
  const button = node('button', className, label);
  button.type = 'button';
  button.addEventListener('click', action);
  return button;
};

/**
 * Non-modal actions next to a clicked scene object. Panels are borrowed from
 * their original DOM location, never cloned, so their state/listeners survive.
 */
export function createSceneContextMenu({ onClose } = {}) {
  const popup = node('section', 'scene-context-popup');
  const titleId = `scene-context-title-${++contextMenuSequence}`;
  popup.id = `scene-context-menu-${contextMenuSequence}`;
  popup.hidden = true;
  popup.tabIndex = -1;
  popup.setAttribute('aria-labelledby', titleId);
  document.body.append(popup);
  const flyout = node('section', 'scene-context-popup scene-context-submenu');
  flyout.id = `${popup.id}-submenu`;
  flyout.hidden = true;
  flyout.setAttribute('role', 'menu');
  document.body.append(flyout);

  let active = false, disposed = false, mode = 'menu', revision = 0;
  let anchor = { x: 24, y: 100 }, returnTarget = null, menuSpec = null;
  let borrowed = null, layoutFrame = 0, resizeObserver = null;
  let childParent = null, childOpenTimer = 0, childCloseTimer = 0, childRevision = 0;
  let thumbnailObserver = null;
  const childItems = new WeakMap();

  function viewport() {
    const view = window.visualViewport;
    return { left: view?.offsetLeft ?? 0, top: view?.offsetTop ?? 0,
      width: view?.width ?? window.innerWidth, height: view?.height ?? window.innerHeight };
  }
  function position() {
    layoutFrame = 0;
    if (!active || disposed) return;
    const view = viewport(), edge = 12, gap = 12;
    const leftEdge = view.left + edge, topEdge = view.top + edge;
    const rightEdge = view.left + view.width - edge, bottomEdge = view.top + view.height - edge;
    popup.style.maxHeight = `${Math.max(80, view.height - edge * 2)}px`;
    popup.style.maxWidth = `${Math.max(120, view.width - edge * 2)}px`;
    const width = popup.offsetWidth, height = popup.offsetHeight;
    let x = anchor.x + gap, y = anchor.y + gap;
    if (x + width > rightEdge) x = anchor.x - width - gap;
    if (y + height > bottomEdge) y = anchor.y - height - gap;
    x = Math.max(leftEdge, Math.min(rightEdge - width, x));
    y = Math.max(topEdge, Math.min(bottomEdge - height, y));
    popup.style.left = `${Math.round(x)}px`;
    popup.style.top = `${Math.round(y)}px`;
    popup.dataset.horizontal = x < anchor.x ? 'left' : 'right';
    popup.dataset.vertical = y < anchor.y ? 'above' : 'below';
    positionChild();
  }
  function schedulePosition() {
    if (active && !layoutFrame) layoutFrame = requestAnimationFrame(position);
  }
  if (typeof ResizeObserver === 'function') {
    resizeObserver = new ResizeObserver(schedulePosition);
    resizeObserver.observe(popup);
    resizeObserver.observe(flyout);
  }

  function cancelChildTimers() {
    clearTimeout(childOpenTimer);
    clearTimeout(childCloseTimer);
    childOpenTimer = childCloseTimer = 0;
  }
  function closeChild({ restoreFocus = false } = {}) {
    cancelChildTimers();
    childRevision += 1;
    const parent = childParent;
    childParent = null;
    parent?.setAttribute('aria-expanded', 'false');
    thumbnailObserver?.disconnect();
    thumbnailObserver = null;
    flyout.hidden = true;
    delete flyout.dataset.finishMenu;
    delete flyout.dataset.wallFinishMenu;
    flyout.replaceChildren();
    if (restoreFocus && parent?.isConnected) parent.focus({ preventScroll: true });
  }
  function scheduleChildClose() {
    clearTimeout(childOpenTimer);
    clearTimeout(childCloseTimer);
    childOpenTimer = 0;
    childCloseTimer = setTimeout(() => closeChild(), 220);
  }
  function positionChild() {
    if (!childParent || flyout.hidden) return;
    if (!childParent.isConnected) { closeChild(); return; }
    const view = viewport(), edge = 12, gap = 7;
    const leftEdge = view.left + edge, topEdge = view.top + edge;
    const rightEdge = view.left + view.width - edge, bottomEdge = view.top + view.height - edge;
    flyout.style.maxHeight = `${Math.max(80, Math.min(520, view.height - edge * 2))}px`;
    flyout.style.maxWidth = `${Math.max(120, view.width - edge * 2)}px`;
    const rootRect = popup.getBoundingClientRect(), parentRect = childParent.getBoundingClientRect();
    if (parentRect.bottom < rootRect.top || parentRect.top > rootRect.bottom) { closeChild(); return; }
    const width = flyout.offsetWidth, height = flyout.offsetHeight;
    const leftSide = rootRect.right + gap + width > rightEdge;
    const x = leftSide ? rootRect.left - gap - width : rootRect.right + gap;
    flyout.style.left = `${Math.round(Math.max(leftEdge, Math.min(rightEdge - width, x)))}px`;
    flyout.style.top = `${Math.round(Math.max(topEdge, Math.min(bottomEdge - height, parentRect.top - 6)))}px`;
    flyout.dataset.horizontal = leftSide ? 'left' : 'right';
  }
  function focusChildFirst() {
    (flyout.querySelector('[role="menuitem"]:not(:disabled),[role="menuitemradio"]:not(:disabled)') ?? flyout).focus({ preventScroll: true });
  }
  function openChild(item, parent, { focus = false } = {}) {
    cancelChildTimers();
    if (!active || mode !== 'menu' || item.disabled || parent.disabled || !parent.isConnected) return;
    if (childParent === parent && !flyout.hidden) { if (focus) focusChildFirst(); return; }
    closeChild();
    childParent = parent;
    parent.setAttribute('aria-expanded', 'true');
    flyout.tabIndex = -1;
    flyout.setAttribute('aria-label', item.label);
    const heading = node('div', 'scene-context-submenu-heading', item.label);
    const list = node('div', 'scene-context-items scene-context-submenu-items');
    list.setAttribute('role', 'presentation');
    let items, failed = false;
    try { items = typeof item.children === 'function' ? item.children() : item.children; }
    catch { failed = true; }
    if (!Array.isArray(items) || !items.length) items = [{ id: 'empty', label: failed ? "DisplayText0707" : "DisplayText0708", detail: failed ? "DisplayText0709." : "DisplayText0710.", disabled: true }];
    const currentChildRevision = childRevision;
    const pendingImages = new Map();
    flyout.dataset.finishMenu=String(item.id==='floor-finish');
    flyout.dataset.wallFinishMenu=String(item.id==='wall-finish');
    let previousGroup=null;
    for (const child of items) {
      if((child.finishId||child.wallStyleId||child.wallColorId)&&child.group!==previousGroup){const group=node('div',child.finishId?'floor-finish-group-heading':'wall-finish-group-heading',child.groupLabel);group.setAttribute('role','presentation');list.append(group);previousGroup=child.group;}
      const action = makeButton('', 'scene-context-item scene-context-submenu-item', () => runAction(child, action));
      action.dataset.contextAction = child.id;
      action.setAttribute('role', child.finishId||child.wallStyleId||child.wallColorId?'menuitemradio':'menuitem');
      if(child.finishId){action.dataset.floorFinish=child.finishId;action.setAttribute('aria-checked',String(child.current===true));action.classList.toggle('is-current',child.current===true);}
      if(child.wallStyleId||child.wallColorId){action.dataset.wallChoice=child.wallStyleId?'style':'color';action.dataset.wallFinish=child.wallStyleId??child.wallColorId;action.setAttribute('aria-checked',String(child.current===true));action.classList.toggle('is-current',child.current===true);}
      action.disabled = Boolean(child.disabled);
      const art = node('span', 'scene-context-item-thumbnail', child.icon ?? '◇');
      art.setAttribute('aria-hidden', 'true');
      if(child.wallColorId&&/^#[a-f\d]{6}$/i.test(child.swatchColor??''))art.style.backgroundColor=child.swatchColor;
      if(child.finishId&&/^#[a-f\d]{6}$/i.test(child.swatchColor??'')){const chip=node('i','floor-finish-chip');chip.style.setProperty('--finish-color',child.swatchColor);art.append(chip);}
      if (child.image) pendingImages.set(action, { art, image: child.image });
      const copy = node('span', 'scene-context-item-copy');
      copy.append(node('span', 'scene-context-label', child.label));
      if (child.detail) copy.append(node('small', 'scene-context-detail', child.detail));
      action.append(art, copy);
      if (Number.isFinite(child.quantity) && child.quantity > 0) {
        const quantity = node('span', 'scene-context-quantity', `×${child.quantity}`);
        quantity.setAttribute('aria-label', `${child.quantity} DisplayText0711`);
        action.append(quantity);
      }
      list.append(action);
    }
    flyout.replaceChildren(heading, list);
    flyout.hidden = false;
    positionChild();
    const loadImage = action => {
      const spec = pendingImages.get(action);
      if (!spec) return;
      pendingImages.delete(action);
      thumbnailObserver?.unobserve(action);
      Promise.resolve().then(() => {
        if (currentChildRevision !== childRevision || !action.isConnected) return null;
        return typeof spec.image === 'function' ? spec.image() : spec.image;
      }).then(source => {
        if (!source || currentChildRevision !== childRevision || !action.isConnected) return;
        const img = document.createElement('img');
        img.alt = '';
        img.decoding = 'async';
        img.addEventListener('error', () => img.remove(), { once: true });
        img.src = source;
        spec.art.append(img);
      }).catch(() => { /* The readable name and fallback icon remain usable. */ });
    };
    if (typeof IntersectionObserver === 'function') {
      thumbnailObserver = new IntersectionObserver(entries => {
        for (const entry of entries) if (entry.isIntersecting) loadImage(entry.target);
      }, { root: list, rootMargin: '24px' });
      for (const action of pendingImages.keys()) thumbnailObserver.observe(action);
    } else {
      const loadVisible = () => {
        const visible = list.getBoundingClientRect();
        for (const action of pendingImages.keys()) {
          const rect = action.getBoundingClientRect();
          if (rect.bottom >= visible.top && rect.top <= visible.bottom) loadImage(action);
        }
      };
      list.addEventListener('scroll', loadVisible, { passive: true });
      loadVisible();
    }
    if (focus) focusChildFirst();
  }

  function releasePanel() {
    if (!borrowed) return;
    const lease = borrowed;
    borrowed = null;
    lease.hiddenObserver?.disconnect();
    if (lease.placeholder.parentNode) lease.placeholder.replaceWith(lease.element);
    else if (lease.parent?.isConnected) lease.parent.insertBefore(lease.element, lease.next?.parentNode === lease.parent ? lease.next : null);
    else lease.element.remove();
    if (lease.hadHidden) lease.element.setAttribute('hidden', lease.hiddenValue);
    else lease.element.removeAttribute('hidden');
  }
  function close({ restoreFocus = true } = {}) {
    if (!active) return;
    revision += 1;
    active = false;
    closeChild();
    releasePanel();
    popup.hidden = true;
    popup.replaceChildren();
    cancelAnimationFrame(layoutFrame);
    layoutFrame = 0;
    if (restoreFocus) {
      const target = returnTarget?.isConnected ? returnTarget : document.querySelector('#scene-stage');
      target?.focus?.({ preventScroll: true });
    }
    onClose?.();
  }
  function header(title, subtitle, back) {
    const head = node('div', 'scene-context-heading');
    if (back) {
      const backButton = makeButton('‹', 'scene-context-back', () => back());
      backButton.setAttribute('aria-label', "DisplayText0712");
      head.append(backButton);
    }
    const copy = node('div', 'scene-context-title-copy');
    const heading = node('strong', 'scene-context-title', title || "DisplayText0713");
    heading.id = titleId;
    copy.append(heading);
    if (subtitle) copy.append(node('small', 'scene-context-subtitle', subtitle));
    const dismiss = makeButton('×', 'scene-context-close', () => close());
    dismiss.setAttribute('aria-label', "DisplayText0714");
    head.append(copy, dismiss);
    return head;
  }
  function focusFirstMenuItem() {
    (popup.querySelector('[role="menuitem"]:not(:disabled)') ?? popup.querySelector('.scene-context-close') ?? popup).focus({ preventScroll: true });
  }
  async function runAction(item, button) {
    if (item.disabled || button.disabled) return;
    const currentRevision = revision;
    try {
      let result = item.action?.();
      if (result && typeof result.then === 'function') {
        button.disabled = true;
        button.setAttribute('aria-busy', 'true');
        result = await result;
      }
      if (result?.ok === false) {
        showActionError(button, result.error || "DisplayText0715.", currentRevision);
        return;
      }
      // showPanel/open/refreshItems during the action deliberately keeps the
      // next layer open. Plain actions yield focus to the canvas or new dialog.
      if (active && mode === 'menu' && revision === currentRevision) close({ restoreFocus: false });
    } catch {
      showActionError(button, "DisplayText0716, DisplayText0717.", currentRevision);
    }
  }
  function showActionError(button, message, actionRevision) {
    if (!active || revision !== actionRevision || !button.isConnected) return;
    button.disabled = false;
    button.removeAttribute('aria-busy');
    const surface = flyout.contains(button) ? flyout : popup;
    let error = surface.querySelector('.scene-context-error');
    if (!error) { error = node('p', 'scene-context-error'); error.setAttribute('role', 'status'); }
    error.textContent = message;
    button.after(error);
    error.scrollIntoView({ block: 'nearest' });
    schedulePosition();
  }
  function renderMenu(focusId) {
    closeChild();
    const spec = menuSpec;
    popup.className = 'scene-context-popup';
    popup.setAttribute('role', 'menu');
    popup.removeAttribute('aria-modal');
    const list = node('div', 'scene-context-items');
    list.setAttribute('role', 'presentation');
    for (const item of spec.items ?? []) {
      const hasChildren = Array.isArray(item.children) || typeof item.children === 'function';
      const action = makeButton('', 'scene-context-item', () => hasChildren ? openChild(item, action) : runAction(item, action));
      action.dataset.contextAction = item.id;
      action.setAttribute('role', 'menuitem');
      action.disabled = Boolean(item.disabled);
      action.classList.toggle('is-danger', Boolean(item.danger));
      const icon = node('span', 'scene-context-icon', item.icon ?? '');
      icon.setAttribute('aria-hidden', 'true');
      const copy = node('span', 'scene-context-item-copy');
      copy.append(node('span', 'scene-context-label', item.label));
      if (item.detail) copy.append(node('small', 'scene-context-detail', item.detail));
      action.append(icon, copy);
      if (hasChildren) {
        childItems.set(action, item);
        action.classList.add('has-submenu');
        action.setAttribute('aria-haspopup', 'menu');
        action.setAttribute('aria-expanded', 'false');
        action.setAttribute('aria-controls', flyout.id);
        const arrow = node('span', 'scene-context-submenu-arrow', '›');
        arrow.setAttribute('aria-hidden', 'true');
        action.append(arrow);
      }
      action.addEventListener('pointerenter', () => {
        cancelChildTimers();
        if (childParent && childParent !== action) closeChild();
        if (hasChildren && !action.disabled) childOpenTimer = setTimeout(() => openChild(item, action), 100);
      });
      action.addEventListener('pointerleave', event => {
        if (hasChildren && !flyout.contains(event.relatedTarget)) scheduleChildClose();
      });
      action.addEventListener('focus', () => { if (childParent && childParent !== action) closeChild(); });
      list.append(action);
    }
    popup.replaceChildren(header(spec.title, spec.subtitle), list);
    popup.hidden = false;
    position();
    const focused = focusId && [...list.querySelectorAll('[data-context-action]')].find(item => item.dataset.contextAction === focusId && !item.disabled);
    if (focused) focused.focus({ preventScroll: true });
    else focusFirstMenuItem();
  }
  function open(spec = {}) {
    if (disposed) return;
    releasePanel();
    revision += 1;
    active = true;
    mode = 'menu';
    anchor = { x: Number.isFinite(spec.x) ? spec.x : anchor.x, y: Number.isFinite(spec.y) ? spec.y : anchor.y };
    returnTarget = spec.returnFocus ?? document.querySelector('#scene-stage') ?? document.activeElement;
    menuSpec = { ...spec, items: [...(spec.items ?? [])] };
    renderMenu();
  }
  function showPanel({ title, element, onBack, wide = false } = {}) {
    if (disposed || !(element instanceof HTMLElement) || element === popup || element.contains(popup)) return;
    releasePanel();
    closeChild();
    revision += 1;
    active = true;
    mode = 'panel';
    const parent = element.parentNode, next = element.nextSibling;
    const placeholder = document.createComment('scene-context: borrowed panel returns here');
    if (parent) parent.insertBefore(placeholder, element);
    borrowed = { element, placeholder, parent, next, hadHidden: element.hasAttribute('hidden'), hiddenValue: element.getAttribute('hidden') ?? '' };
    if (typeof MutationObserver === 'function') {
      const lease = borrowed;
      lease.hiddenObserver = new MutationObserver(() => {
        if (borrowed === lease && element.hidden) element.hidden = false;
      });
      lease.hiddenObserver.observe(element, { attributes: true, attributeFilter: ['hidden'] });
    }
    popup.className = `scene-context-popup scene-context-panel${wide ? ' is-wide' : ''}`;
    popup.setAttribute('role', 'dialog');
    popup.setAttribute('aria-modal', 'false');
    const content = node('div', 'scene-context-content');
    content.append(element);
    element.hidden = false;
    popup.replaceChildren(header(title || menuSpec?.title || "DisplayText0718", '', onBack), content);
    popup.hidden = false;
    position();
    const focusable = content.querySelector('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]');
    if (focusable && !focusable.closest('[hidden]')) focusable.focus({ preventScroll: true });
    else (popup.querySelector('.scene-context-back') ?? popup.querySelector('.scene-context-close') ?? popup).focus({ preventScroll: true });
  }
  function refreshItems(items) {
    if (!active || disposed) return;
    revision += 1;
    if (mode === 'menu') {
      const focusId = popup.contains(document.activeElement) ? document.activeElement.dataset.contextAction : null;
      if (Array.isArray(items)) menuSpec.items = [...items];
      renderMenu(focusId);
    } else {
      if (borrowed) borrowed.element.hidden = false;
      schedulePosition();
    }
  }
  function outsidePointer(event) {
    if (active && !popup.contains(event.target) && !flyout.contains(event.target)) close({ restoreFocus: false });
  }
  function keyboard(event) {
    if (!active || event.defaultPrevented) return;
    if (event.key === 'Escape') {
      // A modal opened by a panel action owns Escape while it is on top.
      if (document.activeElement?.closest('dialog[open]') && !popup.contains(document.activeElement) && !flyout.contains(document.activeElement)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (childParent && flyout.contains(event.target)) closeChild({ restoreFocus: true });
      else close();
      return;
    }
    const inChild = flyout.contains(event.target);
    if (mode !== 'menu' || (!popup.contains(event.target) && !inChild)) return;
    if (event.key === 'Tab') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === 'ArrowLeft' && inChild) {
      event.preventDefault();
      closeChild({ restoreFocus: true });
      return;
    }
    if (event.key === 'ArrowRight' && !inChild) {
      const item = childItems.get(document.activeElement);
      if (item) { event.preventDefault(); openChild(item, document.activeElement, { focus: true }); }
      return;
    }
    const menu = inChild ? flyout : popup;
    const actions = [...menu.querySelectorAll('[role="menuitem"]:not(:disabled),[role="menuitemradio"]:not(:disabled)')];
    if (!actions.length) return;
    const index = actions.indexOf(document.activeElement);
    let next = null;
    if (event.key === 'ArrowDown') next = actions[(index + 1 + actions.length) % actions.length];
    if (event.key === 'ArrowUp') next = actions[(index - 1 + actions.length) % actions.length];
    if (event.key === 'Home') next = actions[0];
    if (event.key === 'End') next = actions.at(-1);
    if (next) { event.preventDefault(); next.focus({ preventScroll: true }); next.scrollIntoView({ block: 'nearest' }); }
  }
  const stop = event => event.stopPropagation();
  for (const menu of [popup, flyout]) {
    for (const type of ['pointerdown', 'pointerup', 'click', 'dblclick']) menu.addEventListener(type, stop);
    menu.addEventListener('contextmenu', event => { event.preventDefault(); event.stopPropagation(); });
  }
  flyout.addEventListener('pointerenter', cancelChildTimers);
  flyout.addEventListener('pointerleave', event => {
    if (!childParent?.contains(event.relatedTarget)) scheduleChildClose();
  });
  popup.addEventListener('scroll', schedulePosition, true);
  function viewportChanged() {
    closeChild({ restoreFocus: flyout.contains(document.activeElement) });
    schedulePosition();
  }
  document.addEventListener('pointerdown', outsidePointer, true);
  document.addEventListener('keydown', keyboard, true);
  window.addEventListener('resize', viewportChanged);
  window.visualViewport?.addEventListener('resize', viewportChanged);
  window.visualViewport?.addEventListener('scroll', viewportChanged);

  return {
    open, showPanel, close, refreshItems,
    isOpen: () => active,
    dispose() {
      close({ restoreFocus: false });
      disposed = true;
      resizeObserver?.disconnect();
      popup.remove();
      flyout.remove();
      document.removeEventListener('pointerdown', outsidePointer, true);
      document.removeEventListener('keydown', keyboard, true);
      window.removeEventListener('resize', viewportChanged);
      window.visualViewport?.removeEventListener('resize', viewportChanged);
      window.visualViewport?.removeEventListener('scroll', viewportChanged);
    },
  };
}
