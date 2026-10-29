import { SHOP_ROOMS, productMatchesRoom, shopRoomIds } from './home-shop-rooms.js';
import { SHOP_CATEGORY_LABELS as categoryLabels, shopCategory as categoryOf, shopPlacement as productPlacement, shopFamily, shopFamilyLabel, shopTier as tierOf, isNewShopProduct, getShopPage, getShopDepartment, shopInventoryScope, inventoryUsageStatus } from './home-shop-browse.js';
import { CELL, roomRect } from './home-layout.js';
import { ELEVATOR_UPGRADE_PRODUCT } from './home-elevator-products.js';
const number = value => new Intl.NumberFormat('en').format(Number(value) || 0);
const tierLabels = { essential: "Essential", comfort: "Comfort", signature: "Signature" };
const roomSizeLabels = {essential:"DisplayText1448",comfort:"DisplayText1449",signature:"DisplayText1450"};
const placementLabels = { table: "DisplayText3162", wall: "DisplayText3163", floor: "DisplayText3164", ceiling: "DisplayText3165", outdoor: "DisplayText3166", room: "DisplayText3167", storey: "DisplayText3168", outfit:"DisplayText2775", headwear:"DisplayText2776", footwear:"DisplayText2777" };
const tabLabels = { shop: "DisplayText3169", outdoor: "DisplayText2769", clothing:"DisplayText2774", rooms: "DisplayText3170", inventory: "Inventory", resale:"DisplayText3171", orders: "DisplayText3172" };

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function button(text, className, action) {
  const node = element('button', className, text);
  node.type = 'button';
  if (action) node.addEventListener('click', action);
  return node;
}

/** Local sample store. Persistence, checkout and placement belong to the caller. */
export function createHomeShop({ catalog, getState, onCartChange, onCheckout, onPlace, getThumbnail, onPlanConstruction, onChooseElevator, onTryClothing, getResaleQuote, onSell, accountMode = false }) {
  const products = Array.isArray(catalog) ? catalog : Object.values(catalog ?? {});
  const productById = new Map(products.map(product => [product.skuId, product]));
  let activeTab = 'shop', room = 'all', filtersOpen = true, category = 'all', placement = 'all', family = 'all', tier = 'all', role = 'all', sport = 'all', sort = 'newest', query = '', inventoryFilter = 'stored', inventoryScope = 'all', page = 1, newOnly = false;
  let busy = false, disposed = false, lastFocus = null, receipt = null, thumbnailEpoch = 0;
  let thumbnailQueue = Promise.resolve();
  let mobilePanel = null, statusTimer = null;
  const compactViewport = typeof matchMedia === 'function' ? matchMedia('(max-width: 760px)') : null;
  const thumbnails = new Map();
  const thumbnailRequests = new WeakMap();

  const dialog = element('dialog', 'home-shop-dialog');
  dialog.id = 'home-shop-dialog';
  dialog.setAttribute('aria-labelledby', 'home-shop-title');
  const shell = element('div', 'home-shop-shell');
  const header = element('header', 'home-shop-header');
  const heading = element('div', 'home-shop-heading');
  const eyebrow=element('p', 'home-shop-eyebrow', "DisplayText3173, DisplayText3174");heading.append(eyebrow);
  const title = element('h2', '', "DisplayText3175");
  title.id = 'home-shop-title';
  heading.append(title);
  const wallet = element('div', 'home-shop-wallet');
  wallet.setAttribute('aria-label', accountMode ? "DisplayText3176" : "DisplayText3177");
  const walletAmount = element('strong');
  wallet.append(element('span', '', accountMode ? "DisplayText0007" : "DisplayText3178"), walletAmount, element('small', '', accountMode ? "DisplayText3179 · Learning Platform DisplayText3180" : "DisplayText3181"));
  const closeButton = button('', 'home-shop-close', close);
  closeButton.setAttribute('aria-label', "DisplayText3182, DisplayText3183");
  const closeIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  closeIcon.setAttribute('viewBox', '0 0 24 24');
  closeIcon.setAttribute('width', '20');
  closeIcon.setAttribute('height', '20');
  closeIcon.setAttribute('aria-hidden', 'true');
  closeIcon.setAttribute('focusable', 'false');
  const closePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  closePath.setAttribute('d', 'M6 6 18 18 M18 6 6 18');
  closePath.setAttribute('fill', 'none');
  closePath.setAttribute('stroke', 'currentColor');
  closePath.setAttribute('stroke-width', '2');
  closePath.setAttribute('stroke-linecap', 'round');
  closeIcon.append(closePath);
  closeButton.append(closeIcon);
  header.append(heading, wallet, closeButton);
  const navigation = element('nav', 'home-shop-nav');
  navigation.setAttribute('aria-label', "DisplayText3184");
  const tabButtons = new Map();
  for (const [id, label] of Object.entries(tabLabels)) {
    if(id === 'resale' && !onSell) continue;
    if(id === 'clothing' && !products.some(product => product.productType === 'clothing')) continue;
    const tab = button(label, 'home-shop-tab', () => switchTab(id));
    tab.dataset.shopTab = id;
    tabButtons.set(id, tab);
    navigation.append(tab);
  }
  const status = element('p', 'home-shop-status');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.hidden = true;
  const body = element('div', 'home-shop-body');
  shell.append(header, navigation, status, body);
  dialog.append(shell);
  document.body.append(dialog);
  // Cards below the fold do not construct models. Every visible thumbnail still
  // shares the caller's renderer and the same sequential work queue.
  const thumbnailObserver = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      thumbnailObserver.unobserve(entry.target);
      thumbnailRequests.get(entry.target)?.();
      thumbnailRequests.delete(entry.target);
    }
  }, { root: dialog, rootMargin: '120px 0px' }) : null;

  function state() { return getState() ?? {}; }
  function cartLines() {
    return (state().cart ?? []).map(line => ({ ...line, product: productById.get(line.skuId) })).filter(line => line.product && line.quantity > 0);
  }
  function report(message, isError = false) {
    clearTimeout(statusTimer);
    status.textContent = message;
    status.hidden = !message;
    status.classList.toggle('is-error', isError);
    if (message && !isError && !busy) statusTimer = setTimeout(() => { status.hidden=true; }, 3800);
  }
  function resultMessage(result, fallback) {
    return typeof result?.error === 'string' ? result.error : result?.error?.message ?? result?.message ?? fallback;
  }
  function switchTab(tab) {
    if (busy) return;
    activeTab = tab;
    if(tab==='resale')inventoryFilter='all';
    mobilePanel = null;
    query = ''; room = 'all'; category = 'all'; placement = 'all'; family = 'all'; tier = 'all'; role = 'all'; sport = 'all'; inventoryScope = 'all'; page = 1; newOnly = false;
    report('');
    render();
  }
  function close() {
    if (!dialog.open || busy) return;
    dialog.close();
  }
  dialog.addEventListener('cancel', event => {
    if (busy) { event.preventDefault(); return; }
    if (mobilePanel) { event.preventDefault(); setMobilePanel(null); }
  });
  function syncMobilePanels() {
    const compact = compactViewport?.matches ?? false;
    if (!compact) mobilePanel=null;
    body.classList.toggle('is-cart-open', compact && mobilePanel === 'cart');
    body.classList.toggle('is-filters-open', compact && mobilePanel === 'filters');
    for (const [selector, panel] of [['.home-shop-sidebar','filters'],['.home-shop-cart','cart'],['.home-shop-main',null]]) {
      const region=body.querySelector(selector);
      if (region) region.inert=compact && (panel ? mobilePanel !== panel : Boolean(mobilePanel));
    }
    const mobileBar=body.querySelector('.home-shop-mobile-cartbar');
    if (mobileBar) mobileBar.inert=compact && Boolean(mobilePanel);
    for (const node of body.querySelectorAll('[data-shop-panel]')) node.setAttribute('aria-expanded', String(compact && mobilePanel === node.dataset.shopPanel));
  }
  function setMobilePanel(panel) {
    const previous=mobilePanel;
    mobilePanel=panel;
    syncMobilePanels();
    const target = panel ? body.querySelector(panel === 'cart' ? '.home-shop-cart-back' : '.home-shop-sidebar-back') : body.querySelector(previous === 'filters' ? '.home-shop-mobile-filters' : '.home-shop-mobile-cart');
    target?.focus({preventScroll:true});
  }
  compactViewport?.addEventListener('change', syncMobilePanels);
  dialog.addEventListener('close', () => {
    thumbnailEpoch += 1;
    thumbnailObserver?.disconnect();
    if (lastFocus?.isConnected) lastFocus.focus({ preventScroll: true });
  });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close();
  });

  function imageFor(product, item) {
    const figure = element('div', 'home-shop-picture');
    const placeholder = element('span', 'home-shop-image-placeholder', "DisplayText3185");
    figure.append(placeholder);
    const key = JSON.stringify([product.skuId, item?.color, item?.material, item?.level, item?.plans, item?.legacyPlans, item?.legacyFootprint, item?.legacyIncludedExtras]);
    const epoch = thumbnailEpoch;
    const show = source => {
      if (!source || disposed || epoch !== thumbnailEpoch || !figure.isConnected) return;
      const image = element('img');
      image.src = source;
      image.alt = `${product.name}DisplayText3186`;
      image.draggable = false;
      image.decoding = 'async';
      image.loading = 'lazy';
      figure.replaceChildren(image);
    };
    const request = () => {
      if (thumbnails.has(key)) { show(thumbnails.get(key)); return; }
      // Share one WebGL thumbnail renderer; never construct one renderer per card.
      thumbnailQueue = thumbnailQueue.then(async () => {
        // Filter changes can invalidate several pending jobs; discard those
        // immediately rather than making the new results wait one frame each.
        if (disposed || epoch !== thumbnailEpoch || !figure.isConnected) return;
        await new Promise(resolve => requestAnimationFrame(resolve));
        if (disposed || epoch !== thumbnailEpoch || !figure.isConnected) return;
        // Repeated owned copies may have entered the queue before the first
        // copy completed. Check the cache again before building another model.
        if (thumbnails.has(key)) { show(thumbnails.get(key)); return; }
        try {
          const source = await getThumbnail?.(item ? { ...product, item } : product);
          if (source) {
            thumbnails.set(key, source);
            if (thumbnails.size > 128) thumbnails.delete(thumbnails.keys().next().value);
            show(source);
          }
          else placeholder.textContent = "DisplayText3187";
        } catch { placeholder.textContent = "DisplayText3187"; }
      });
    };
    if (thumbnailObserver) {
      thumbnailRequests.set(figure, request);
      thumbnailObserver.observe(figure);
    } else queueMicrotask(request);
    return figure;
  }

  function productInfo(product, showPrice = false, compact = false) {
    const fragment = document.createDocumentFragment();
    fragment.append(element('h3', 'home-shop-product-name', product.name));
    if (showPrice) fragment.append(element('strong', 'home-shop-price home-shop-price-lead', `${number(product.price)} DisplayText0920`));
    const badges = element('div', 'home-shop-product-badges');
    const badge = element('span', 'home-shop-tier', (product.productType === 'room' ? roomSizeLabels : tierLabels)[tierOf(product)] ?? "Comfort");
    badge.dataset.tier = tierOf(product);
    badges.append(badge);
    const location = element('span', 'home-shop-location', placementLabels[productPlacement(product)] ?? "DisplayText1425");
    location.dataset.placement = productPlacement(product);
    badges.append(location);
    if (isNewShopProduct(product)) badges.append(element('span','home-shop-new-badge',"DisplayText3188"));
    fragment.append(badges);
    const description=element('p', 'home-shop-product-description', product.description ?? "DisplayText3189, DisplayText3190, DisplayText3191.");
    if (!compact) fragment.append(description);
    const dimensions = product.productType === 'clothing' ? "DisplayText3192 · DisplayText3193" : product.productType === 'storey' ? "DisplayText3194 · DisplayText3195" : product.productType === 'room'
      ? `${number(product.cols * CELL.width)} × ${number(product.rows * CELL.depth)} m · ${number(Number((product.cols * CELL.width * product.rows * CELL.depth).toFixed(2)))} sqm`
      : productPlacement(product) === 'wall' && product.width && product.height
      ? `DisplayText3196 ${product.width} × ${product.height}`
      : product.width && product.depth ? `DisplayText3197 ${product.width} × ${product.depth}` : "DisplayText3198 · DisplayText3199";
    if(product.kitchenFit){
      const fit=product.kitchenFit,summary=fit.canDock?`${fit.seriesLabel} · DisplayText3200 ${fit.worktopHeight} · DisplayText3201 ${fit.depth} · DisplayText3202`:fit.seriesLabel;
      fragment.append(element('span','home-shop-dimensions',summary));
    }
    if(compact&&['modular-kitchen-2026-10-25','roomy-furniture-2026-10-25'].includes(product.collection))fragment.append(element('span','home-shop-dimensions',dimensions));
    if (compact) {
      const more=element('details','home-shop-product-more');
      more.append(element('summary','',"DisplayText3203"), element('span','home-shop-dimensions',dimensions), description);
      if (product.productType === 'room') more.append(element('small', 'home-shop-room-note', "DisplayText3204, DisplayText3205, DisplayText3206; DisplayText3207, DisplayText3208."));
      fragment.append(more);
    } else fragment.append(element('span', 'home-shop-dimensions', dimensions));
    if (!compact && product.productType === 'room') fragment.append(element('small', 'home-shop-room-note', "DisplayText3204, DisplayText3205, DisplayText3206; DisplayText3207, DisplayText3208."));
    return fragment;
  }
  function emptyState(target, headingText, description, actionText, action) {
    const empty = element('div', 'home-shop-empty');
    empty.append(element('span', 'home-shop-empty-mark', '⌂'), element('h3', '', headingText), element('p', '', description));
    if (actionText) empty.append(button(actionText, 'home-shop-primary', action));
    target.append(empty);
  }

  function render({ resetCatalog = false } = {}) {
    if (disposed) return;
    const focused = dialog.contains(document.activeElement) ? document.activeElement : null;
    const searchSelection = focused?.matches('.home-shop-search') ? { start: focused.selectionStart, end: focused.selectionEnd } : null;
    const focusToken = focused?.hasAttribute('data-shop-tier') ? ['data-shop-tier', focused.getAttribute('data-shop-tier')] : focused?.getAttribute('data-shop-add') ? ['data-shop-add', focused.getAttribute('data-shop-add')]
      : focused?.hasAttribute('data-shop-room') ? ['data-shop-room', focused.getAttribute('data-shop-room')]
      : focused?.hasAttribute('data-shop-category') ? ['data-shop-category', focused.getAttribute('data-shop-category')]
        : focused?.hasAttribute('data-shop-outdoor-section') ? ['data-shop-outdoor-section', focused.getAttribute('data-shop-outdoor-section')]
        : focused?.hasAttribute('data-shop-family') ? ['data-shop-family', focused.getAttribute('data-shop-family')]
        : focused?.hasAttribute('data-shop-inventory-scope') ? ['data-shop-inventory-scope', focused.getAttribute('data-shop-inventory-scope')]
        : focused?.hasAttribute('data-shop-placement') ? ['data-shop-placement', focused.getAttribute('data-shop-placement')]
        : focused?.hasAttribute('data-shop-inventory-filter') ? ['data-shop-inventory-filter', focused.getAttribute('data-shop-inventory-filter')]
          : ['BUTTON','SELECT'].includes(focused?.tagName) && focused.getAttribute('aria-label') ? ['aria-label', focused.getAttribute('aria-label')] : null;
    const keepScroll = body.dataset.tab === activeTab;
    const scroll = keepScroll ? { sidebar: body.querySelector('.home-shop-sidebar-content')?.scrollTop ?? 0, families: body.dataset.room === room ? body.querySelector('.home-shop-room-families')?.scrollLeft ?? 0 : 0, body: body.scrollTop, catalog: resetCatalog ? 0 : body.querySelector('.home-shop-catalog-content')?.scrollTop ?? 0, cart: body.querySelector('.home-shop-cart-items')?.scrollTop ?? 0 } : null;
    thumbnailEpoch += 1;
    thumbnailObserver?.disconnect();
    const snapshot = state();
    walletAmount.textContent = number(snapshot.wallet?.balance);
    title.textContent = tabLabels[activeTab];
    eyebrow.textContent=activeTab==='resale'?"DisplayText3209, DisplayText3210":activeTab==='orders'?"DisplayText3211, DisplayText3212":"DisplayText3173, DisplayText3174";
    const storedCount = (snapshot.owned ?? []).filter(item => inventoryUsageStatus(item, productById.get(item.skuId), snapshot.avatar) === 'stored').length;
    for (const [id, tab] of tabButtons) {
      tab.classList.toggle('is-active', id === activeTab);
      tab.setAttribute('aria-pressed', String(id === activeTab));
      tab.textContent = id === 'inventory' && storedCount ? `Inventory (${storedCount})` : tabLabels[id];
      tab.disabled = busy;
    }
    closeButton.disabled = busy;
    body.replaceChildren();
    body.dataset.tab = activeTab;
    body.dataset.room = room;
    body.classList.toggle('is-shopping', ['shop','outdoor','rooms','clothing'].includes(activeTab));
    if (['shop','outdoor','rooms','clothing'].includes(activeTab)) renderShop();
    else if (activeTab === 'inventory' || activeTab === 'resale') renderInventory();
    else renderOrders();
    syncMobilePanels();
    if (scroll) {
      body.scrollTop = scroll.body;
      const sidebarBody=body.querySelector('.home-shop-sidebar-content');
      if(sidebarBody)sidebarBody.scrollTop=scroll.sidebar;
      const catalogBody = body.querySelector('.home-shop-catalog-content'), cartBody = body.querySelector('.home-shop-cart-items');
      if (catalogBody) catalogBody.scrollTop = scroll.catalog;
      if (cartBody) cartBody.scrollTop = scroll.cart;
      const uses=body.querySelector('.home-shop-room-families');
      if(uses) uses.scrollLeft=scroll.families;
    }
    if (focusToken && !focused.isConnected) {
      const [attribute, value] = focusToken;
      [...body.querySelectorAll(`[${attribute}]`)].find(node => node.getAttribute(attribute) === value && !node.disabled)?.focus({ preventScroll: true });
    }
    if (searchSelection) {
      const search = body.querySelector('.home-shop-search');
      search?.focus({ preventScroll: true });
      search?.setSelectionRange(searchSelection.start, searchSelection.end);
    }
  }

  async function changeCart(skuId, quantity, message) {
    if (busy) return;
    busy = true;
    try {
      const result = await onCartChange(skuId, Math.max(0, quantity));
      report(result?.ok === false ? resultMessage(result, "DisplayText3213, DisplayText0974.") : message, result?.ok === false);
    } catch { report("DisplayText3213, DisplayText0974.", true); }
    finally { busy = false; refreshCart(); if (!status.classList.contains('is-error')) statusTimer=setTimeout(()=>{status.hidden=true;},3800); }
  }
  function renderShop() {
    const department = getShopDepartment(products, activeTab);
    const roomProducts = department.filter(product => productMatchesRoom(product, activeTab === 'shop' ? room : 'all'));
    const main = element('section', 'home-shop-main');
    main.setAttribute('aria-label', activeTab === 'clothing' ? "DisplayText3214" : activeTab === 'rooms' ? "DisplayText3215" : activeTab === 'outdoor' ? "DisplayText3216" : "DisplayText3217");
    const toolbar = element('div', 'home-shop-toolbar');
    const sidebar = element('aside','home-shop-sidebar');
    sidebar.id='home-shop-sidebar';
    sidebar.setAttribute('aria-label',"DisplayText3218");
    const sidebarHeader=element('div','home-shop-sidebar-heading');
    sidebarHeader.append(element('strong','',activeTab === 'shop' ? "DisplayText3219" : "DisplayText3220"),button("DisplayText3221",'home-shop-sidebar-back',()=>setMobilePanel(null)));
    const sidebarContent=element('div','home-shop-sidebar-content');
    sidebar.append(sidebarHeader,sidebarContent);
    const placements = element('div', 'home-shop-placements');
    placements.setAttribute('aria-label', activeTab === 'clothing' ? "DisplayText3222" : activeTab === 'outdoor' ? "DisplayText3223" : "DisplayText3224");
    for (const [id, label] of activeTab === 'clothing' ? [['all',"DisplayText3225"],['outfit',"DisplayText2775"],['headwear',"DisplayText2776"],['footwear',"DisplayText2777"]] : ['rooms','outdoor'].includes(activeTab) ? [] : [['all', "DisplayText3226"], ['table', "DisplayText0771"], ['wall', "DisplayText0785"], ['floor', "DisplayText3114"], ...(department.some(product => productPlacement(product) === 'ceiling') ? [['ceiling', "DisplayText3227"]] : []), ...(department.some(product => productPlacement(product) === 'outdoor') ? [['outdoor', "DisplayText0873"]] : [])]) {
      const count = roomProducts.filter(product => id === 'all' || productPlacement(product) === id).length;
      const filter = button(`${label} ${count}`, 'home-shop-placement-filter', () => { placement = id; if (activeTab === 'clothing') category = 'all'; family = 'all'; page = 1; render({ resetCatalog: true }); });
      filter.dataset.shopPlacement = id;
      filter.setAttribute('aria-pressed', String(placement === id));
      filter.classList.toggle('is-active', placement === id);
      placements.append(filter);
    }
    if (activeTab === 'outdoor') for (const [id,label,sectionSport,sectionRole] of [['all',"DisplayText3228",'all','all'],['garden',"DisplayText3229",false,'all'],['sports',"DisplayText3230",true,'facility'],['sports-accessories',"DisplayText3231",true,'accessory']]) {
      const count=department.filter(product=>(sectionSport==='all'||Boolean(product.sport)===sectionSport)&&(sectionRole==='all'||product.role===sectionRole)).length;
      const active=sport===sectionSport&&role===sectionRole;
      const filter=button(`${label} ${count}`,'home-shop-placement-filter',()=>{sport=sectionSport;role=sectionRole;family='all';page=1;render({resetCatalog:true});});
      filter.dataset.shopOutdoorSection=id;filter.setAttribute('aria-pressed',String(active));filter.classList.toggle('is-active',active);placements.append(filter);
    }
    const categories = element('select', 'home-shop-select');
    categories.setAttribute('aria-label', "DisplayText3232");
    const categoryEntries = [['all', activeTab === 'rooms' ? "DisplayText3233" : "DisplayText3234"], ...[...new Set(department.map(categoryOf).filter(Boolean))].map(id => [id, categoryLabels[id] ?? id])];
    for (const [id, label] of categoryEntries) {
      const option = element('option', '', label); option.value = id; categories.append(option);
    }
    categories.value = category;
    categories.addEventListener('change', () => { category = categories.value; family = 'all'; page = 1; render({ resetCatalog: true }); });
    const families = element('select','home-shop-select'); families.setAttribute('aria-label',"DisplayText3235");
    const familyPool = roomProducts.filter(product => (category === 'all' || categoryOf(product) === category) && (placement === 'all' || productPlacement(product) === placement) && (role === 'all' || product.role === role) && (sport === 'all' || Boolean(product.sport) === sport));
    const kitchenOrder=['modular-dishwasher','modular-hob','modular-sink','modular-base','modular-island','modular-oven-tower','modular-fridge','modular-hood','modular-wall-cabinet'];
    const kitchenRank=id=>{const i=kitchenOrder.indexOf(id);return i<0?kitchenOrder.length:i;};
    const familyEntries = new Map(familyPool.map(product => [shopFamily(product),shopFamilyLabel(product)]).sort((a,b)=>room==='kitchen'?kitchenRank(a[0])-kitchenRank(b[0]):Number(b[0]==='toilets')-Number(a[0]==='toilets')));
    for (const [id,label] of [['all',"DisplayText3236"], ...familyEntries]) {
      const option=element('option','',id==='all'?label:`${label} · ${familyPool.filter(product=>shopFamily(product)===id).length}DisplayText3237`); option.value=id; families.append(option);
    }
    families.value=family;
    families.addEventListener('change',()=>{family=families.value;page=1;render({resetCatalog:true});});
    const tiers = element('div', 'home-shop-tiers'); tiers.setAttribute('aria-label', "DisplayText3238");
    for (const [id, label] of [['all', activeTab === 'rooms' ? "DisplayText3239" : "DisplayText3240"], ...Object.entries(activeTab === 'rooms' ? roomSizeLabels : tierLabels)]) {
      const choice = button(label, 'home-shop-category', () => { tier = id; page = 1; render({ resetCatalog: true }); });
      choice.dataset.shopTier = id; choice.setAttribute('aria-pressed', String(tier === id)); choice.classList.toggle('is-active', tier === id); tiers.append(choice);
    }
    const sorting = element('select', 'home-shop-select'); sorting.setAttribute('aria-label', "DisplayText3241");
    for (const [id,label] of [['newest',"DisplayText3242"],['featured',"DisplayText3243"],['price-asc',"Price: DisplayText3244"],['price-desc',"Price: DisplayText3245"]]) {
      const option = element('option','',label); option.value=id; sorting.append(option);
    }
    sorting.value=sort; sorting.addEventListener('change',()=>{sort=sorting.value;page=1;catalogContent.scrollTop=0;updateProducts();});
    const search = element('input', 'home-shop-search');
    search.type = 'search';
    search.placeholder = activeTab === 'clothing' ? "DisplayText3246, DisplayText0045, DisplayText0158, DisplayText0190…" : activeTab === 'rooms' ? "DisplayText3247, Study, DisplayText3248…" : activeTab === 'outdoor' ? "DisplayText3249, DisplayText3250, DisplayText3251, DisplayText2000…" : "DisplayText3252, DisplayText0779, DisplayText3253, DisplayText1185…";
    search.setAttribute('aria-label', "DisplayText3254, DisplayText3255");
    search.value = query;
    const secondary = element('div','home-shop-filter-row'); if(!['clothing','shop'].includes(activeTab))secondary.append(categories); if(activeTab!=='rooms')secondary.append(families); secondary.append(tiers);
    const newCount=department.filter(isNewShopProduct).length;
    if (newCount) {
      const arrivals=button(`DisplayText3256 ${newCount}`, 'home-shop-placement-filter',()=>{newOnly=!newOnly;page=1;render({ resetCatalog: true });});
      arrivals.setAttribute('aria-label',"DisplayText3257"); arrivals.setAttribute('aria-pressed',String(newOnly)); arrivals.classList.toggle('is-active',newOnly); placements.append(arrivals);
    }
    if (activeTab === 'shop') {
      const rooms = element('nav', 'home-shop-room-departments');
      rooms.setAttribute('aria-label', "DisplayText3219");
      for (const section of [{id:'all',label:"DisplayText3258"}, ...SHOP_ROOMS]) {
        const count = department.filter(product => productMatchesRoom(product, section.id)).length;
        if (!count) continue;
        const choice = button('', 'home-shop-room-choice', () => {
          room = section.id; category = 'all'; placement = 'all'; family = 'all'; tier = 'all'; role = 'all'; sport = 'all'; query = ''; newOnly = false; page = 1;
          render({ resetCatalog: true });
        });
        choice.append(element('span','',section.label), element('small','',`${count} DisplayText3237`));
        choice.dataset.shopRoom = section.id;
        choice.setAttribute('aria-pressed', String(room === section.id));
        choice.classList.toggle('is-active', room === section.id);
        rooms.append(choice);
      }
      sidebarContent.append(rooms);
      if (room !== 'all') {
        const uses = element('nav','home-shop-room-families');
        uses.setAttribute('aria-label',"DisplayText3259");
        for (const [id,label] of [['all',"DisplayText3260"], ...familyEntries]) {
          const choice = button(label,'home-shop-placement-filter',()=>{family=id;page=1;render({resetCatalog:true});});
          choice.dataset.shopFamily=id;
          choice.setAttribute('aria-pressed',String(family===id));
          choice.classList.toggle('is-active',family===id);
          uses.append(choice);
        }
        toolbar.append(uses);
      }
      const tools=element('div','home-shop-room-tools');
      const roomLabel=SHOP_ROOMS.find(section=>section.id===room)?.label;
      tools.append(search, sorting);
      main.dataset.shopRoomLabel=roomLabel??"DisplayText3258";
      toolbar.append(tools);
      const filters=element('details','home-shop-extra-filters');
      filters.open=filtersOpen;
      filters.append(element('summary','',`DisplayText3261${[placement!=='all',tier!=='all',newOnly,category!=='all'].filter(Boolean).length ? " · DisplayText3262" : ''}`),placements,secondary);
      filters.addEventListener('toggle',()=>{filtersOpen=filters.open;});
      sidebarContent.append(filters);
    } else {
      sidebarContent.append(placements,secondary);
      const tools=element('div','home-shop-room-tools');tools.append(search,sorting);toolbar.append(tools);
    }
    toolbar.prepend(button("DisplayText3263 / DisplayText3264",'home-shop-mobile-filters',()=>setMobilePanel('filters')));
    const filterToggle=toolbar.querySelector('.home-shop-mobile-filters');filterToggle.dataset.shopPanel='filters';filterToggle.setAttribute('aria-controls','home-shop-sidebar');
    if (activeTab === 'outdoor' && sport === true && role !== 'accessory') {
      const sports = element('div', 'home-shop-placements');
      sports.setAttribute('aria-label', "DisplayText3265");
      const sportsFamilies = new Map(department.filter(product => product.sport && product.role === 'facility').map(product => [shopFamily(product), shopFamilyLabel(product)]));
      for (const [id, label] of [['all', "DisplayText3266"], ...sportsFamilies]) {
        const choice = button(label, 'home-shop-placement-filter', () => { family = id; role = 'facility'; page = 1; render({resetCatalog:true}); });
        choice.dataset.shopFamily = id;
        choice.setAttribute('aria-pressed', String(family === id));
        choice.classList.toggle('is-active', family === id);
        sports.append(choice);
      }
      sidebarContent.append(sports);
    }
    if (activeTab === 'rooms') sidebarContent.append(element('p','home-shop-department-note',"DisplayText3267, DisplayText3268.DisplayText3269; DisplayText3270." ));
    if (activeTab === 'clothing') sidebarContent.append(element('p','home-shop-department-note',`${accountMode?"DisplayText3275":"DisplayText3276"}DisplayText3271.DisplayText0217, DisplayText3272; DisplayText3273, DisplayText3274.`));
    if (activeTab === 'outdoor') sidebarContent.append(element('p','home-shop-department-note',"DisplayText3277, DisplayText3250, DisplayText3278 8 DisplayText3279; DisplayText3280, DisplayText3281.DisplayText2000, DisplayText3282."));
    const catalogContent = element('div', 'home-shop-catalog-content');
    const grid = element('div', 'home-shop-products');
    const count = element('p', 'home-shop-catalog-count');
    const resultBar=element('div','home-shop-result-bar'), pager=element('nav','home-shop-pager'); pager.setAttribute('aria-label',"DisplayText3283");
    resultBar.append(count,pager);
    if(activeTab==='rooms'&&onPlanConstruction){
      const build=element('article','home-shop-build-entry'),copy=element('div','');
      copy.append(element('h3','',"DisplayText3284 · DisplayText3285"),element('p','',"DisplayText3286, DisplayText3287 L DisplayText0894.DisplayText3288, DisplayText3289; DisplayText3290."));
      build.append(copy,button("DisplayText3291",'home-shop-primary',()=>{close();onPlanConstruction();}));catalogContent.append(build);
    }
    if(activeTab==='rooms'&&onChooseElevator){
      const build=element('article','home-shop-build-entry'),copy=element('div','');
      build.dataset.shopService=ELEVATOR_UPGRADE_PRODUCT.skuId;
      copy.append(element('h3','',ELEVATOR_UPGRADE_PRODUCT.name),element('p','',`DisplayText3292 ${number(ELEVATOR_UPGRADE_PRODUCT.price)} DisplayText0920.DisplayText3293, DisplayText0752, DisplayText3294.`));
      build.append(copy,button("DisplayText3295",'home-shop-primary',()=>{close();onChooseElevator();}));catalogContent.append(build);
    }
    catalogContent.append(resultBar, grid);
    function updateProducts() {
      thumbnailEpoch += 1;
      thumbnailObserver?.disconnect();
      grid.replaceChildren();
      const result=getShopPage(department,{room:activeTab==='shop'?room:'all',category,placement,family,tier,role,sport,query,sort,newOnly,page}); page=result.page;
      count.textContent = `${result.total} / ${roomProducts.length} DisplayText3237 · DisplayText3296 ${result.from}–${result.to}`;
      pager.replaceChildren();
      const go=next=>{const focusedLabel=document.activeElement?.getAttribute('aria-label');page=next;catalogContent.scrollTop=0;updateProducts();const focusTarget=[...pager.querySelectorAll('[aria-label]')].find(node=>node.getAttribute('aria-label')===focusedLabel&&!node.disabled)??pager.querySelector('select');focusTarget?.focus({preventScroll:true});};
      const prev=button("DisplayText3297",'home-shop-page',()=>go(page-1)); prev.setAttribute('aria-label',"DisplayText3298"); prev.disabled=page===1;
      const next=button("DisplayText3299",'home-shop-page',()=>go(page+1)); next.setAttribute('aria-label',"DisplayText3300"); next.disabled=page===result.pages;
      const jump=element('select','home-shop-page-select');jump.setAttribute('aria-label',"DisplayText3301");
      for(let n=1;n<=result.pages;n++){const option=element('option','',`${n} / ${result.pages} DisplayText3302`);option.value=String(n);jump.append(option);}jump.value=String(page);jump.addEventListener('change',()=>go(Number(jump.value)));
      pager.append(prev,jump,next);pager.hidden=result.pages===1;
      if (!result.total) emptyState(grid, "DisplayText3303", "DisplayText3304, DisplayText3305, DisplayText3306.", "DisplayText3307", () => { room = 'all'; category = 'all'; placement = 'all'; family = 'all'; tier = 'all'; role = 'all'; sport = 'all'; query = ''; newOnly=false; page=1; render(); });
      for (const product of result.items) {
        const card = element('article', 'home-shop-product');
        card.dataset.shopProduct = product.skuId;
        card.append(imageFor(product));
        const details = element('div', 'home-shop-product-details');
        details.append(productInfo(product, true, true));
        const footer = element('div', 'home-shop-product-footer');
        const add = button("DisplayText3308", 'home-shop-add', () => {
          const quantity = cartLines().find(line => line.skuId === product.skuId)?.quantity ?? 0;
          changeCart(product.skuId, quantity + 1, `${product.name}DisplayText3309.`);
        });
        add.dataset.shopAdd = product.skuId;
        add.setAttribute('aria-label', `DisplayText3310${product.name}DisplayText3308`);
        const storeyOwned = product.productType === 'storey' && (state().upperFloors?.length || state().owned?.some(row => row.skuId === product.skuId));
        const storeyInCart = product.productType === 'storey' && cartLines().some(line => line.skuId === product.skuId);
        const clothingOwned = product.productType === 'clothing' && state().owned?.some(row => row.skuId === product.skuId);
        const clothingInCart = product.productType === 'clothing' && cartLines().some(line => line.skuId === product.skuId);
        add.disabled = busy || Boolean(storeyOwned) || storeyInCart || Boolean(clothingOwned) || clothingInCart;
        if (storeyOwned) add.textContent = state().upperFloors?.length ? "DisplayText3311" : "DisplayText3312";
        else if (clothingOwned) add.textContent = "DisplayText0906";
        else if (storeyInCart || clothingInCart) add.textContent = "DisplayText3309";
        else { const quantity=cartLines().find(line=>line.skuId===product.skuId)?.quantity??0;if(quantity)add.textContent=`DisplayText3313 · DisplayText3314 ${quantity}`; }

        footer.append(add);
        details.append(footer);
        if (product.productType === 'clothing' && onTryClothing) {
          const tryOn = button(clothingOwned ? "DisplayText3315 / DisplayText3316" : "DisplayText3317", 'home-shop-place', () => {
            if (busy) return;
            close(); onTryClothing(product.skuId);
          });
          tryOn.dataset.shopTryClothing = product.skuId;
          tryOn.setAttribute('aria-label', `DisplayText3318${product.name}`);
          tryOn.disabled = busy;
          details.append(tryOn);
        }
        card.append(details);
        grid.append(card);
      }
    }
    // Only replace the result grid while typing; keep the input, IME composition
    // and caret intact, even when many products match.
    search.addEventListener('input', () => { query = search.value; page=1; catalogContent.scrollTop = 0; updateProducts(); });
    main.append(toolbar, catalogContent);
    body.append(sidebar,main);
    const shade=button("DisplayText3221",'home-shop-panel-shade',()=>setMobilePanel(null));shade.tabIndex=-1;shade.setAttribute('aria-hidden','true');body.append(shade);
    updateProducts();
    renderCart();
  }

  function renderCart() {
    const previousCart=body.querySelector('.home-shop-cart');
    const previousScroll=previousCart?.querySelector('.home-shop-cart-items')?.scrollTop??0;
    const cart = element('aside', 'home-shop-cart');
    cart.id='home-shop-cart';
    cart.setAttribute('aria-label', "Cart");
    const lines = cartLines();
    const quantity = lines.reduce((sum, line) => sum + line.quantity, 0);
    const total = lines.reduce((sum, line) => sum + line.quantity * line.product.price, 0);
    const balance = Number(state().wallet?.balance) || 0;
    const header = element('div', 'home-shop-cart-heading');
    header.tabIndex=-1;
    header.append(element('h3', '', "Cart"), element('span', '', `${quantity} DisplayText3319`),button("DisplayText3320",'home-shop-cart-back',()=>setMobilePanel(null)));
    cart.append(header);
    const content = element('div', 'home-shop-cart-items');
    if (!lines.length) emptyState(content, "DisplayText3321", accountMode ? "DisplayText3322, DisplayText3323." : "DisplayText3322, Furniture, DisplayText3324.");
    for (const line of lines) {
      const row = element('div', 'home-shop-cart-item');
      const info = element('div', 'home-shop-cart-item-info');
      info.append(element('strong', '', line.product.name), element('span', '', `${number(line.product.price)} DisplayText0920 / DisplayText3319`));
      const remove = button("DisplayText3325", 'home-shop-text-button', () => changeCart(line.skuId, 0, `DisplayText3326${line.product.name}.`));
      remove.setAttribute('aria-label', `DisplayText3327${line.product.name}`);
      remove.disabled = busy;
      const quantityControl = element('div', 'home-shop-quantity');
      const decrease = button('−', '', () => changeCart(line.skuId, line.quantity - 1, `DisplayText3328${line.product.name}DisplayText3329.`));
      decrease.setAttribute('aria-label', `DisplayText3330${line.product.name}DisplayText3331`);
      decrease.disabled = busy;
      const amount = element('output', '', number(line.quantity));
      amount.setAttribute('aria-label', `${line.product.name}DisplayText3331`);
      const increase = button('+', '', () => changeCart(line.skuId, line.quantity + 1, `DisplayText3328${line.product.name}DisplayText3329.`));
      increase.setAttribute('aria-label', `DisplayText3332${line.product.name}DisplayText3331`);
      increase.disabled = busy || ['storey','clothing'].includes(line.product.productType);
      quantityControl.append(decrease, amount, increase);
      const bottom = element('div', 'home-shop-cart-item-bottom');
      bottom.append(quantityControl, element('strong', '', number(line.quantity * line.product.price)));
      row.append(info, remove, bottom);
      content.append(row);
    }
    const summary = element('div', 'home-shop-cart-summary');
    const totalRow = element('div', 'home-shop-total');
    totalRow.append(element('span', '', "DisplayText3333"), element('strong', '', `${number(total)} DisplayText0920`));
    const remainder = element('p', 'home-shop-remainder', total > balance ? `DisplayText3334 ${number(total - balance)} DisplayText0920` : `DisplayText3335 ${number(balance - total)}`);
    remainder.classList.toggle('is-error', total > balance);
    const checkout = button(busy ? "DisplayText3336…" : `DisplayText3337 ${quantity} DisplayText3338`, 'home-shop-primary', checkoutCart);
    checkout.dataset.shopCheckout = '';
    checkout.disabled = busy || !quantity || total > balance;
    summary.append(totalRow, remainder, checkout, element('p', 'home-shop-cart-note', accountMode ? "DisplayText3339 Learning Platform DisplayText0007, DisplayText3340." : "DisplayText3341.Furniture, DisplayText3342, DisplayText3343, DisplayText3344."));
    cart.append(content, summary);
    if (previousCart) previousCart.replaceWith(cart); else body.append(cart);
    content.scrollTop=previousScroll;
    body.querySelector('.home-shop-mobile-cartbar')?.remove();
    const mobileBar=element('div','home-shop-mobile-cartbar');
    const review=button(`Cart ${quantity} DisplayText3319`,'home-shop-mobile-cart',()=>setMobilePanel('cart'));
    review.dataset.shopPanel='cart';review.setAttribute('aria-controls','home-shop-cart');
    mobileBar.append(review,element('strong','',`${number(total)} DisplayText0920`));body.append(mobileBar);
    syncMobilePanels();
  }

  function refreshCart() {
    if (!body.classList.contains('is-shopping')) { render(); return; }
    // Do not replace the catalog while adding an item: scroll, expanded product
    // details, the search caret and the thumbnail work already in flight survive.
    const focused=document.activeElement;
    const hadCartFocus=Boolean(body.querySelector('.home-shop-cart')?.contains(focused));
    const focusLabel=hadCartFocus ? focused.getAttribute('aria-label') : null;
    renderCart();
    walletAmount.textContent=number(state().wallet?.balance);
    for (const add of body.querySelectorAll('[data-shop-add]')) {
      const product=productById.get(add.dataset.shopAdd);
      const quantity=cartLines().find(line=>line.skuId===product.skuId)?.quantity??0;
      const owned=state().owned?.some(item=>item.skuId===product.skuId);
      const unique=['storey','clothing'].includes(product.productType);
      add.disabled=busy || Boolean(unique && (owned || quantity || (product.productType==='storey' && state().upperFloors?.length)));
      add.textContent=product.productType==='storey'&&state().upperFloors?.length ? "DisplayText3311" : product.productType==='storey'&&owned ? "DisplayText3312" : unique&&owned ? "DisplayText0906" : unique&&quantity ? "DisplayText3309" : quantity ? `DisplayText3313 · DisplayText3314 ${quantity}` : "DisplayText3308";
    }
    if (hadCartFocus) {
      const target=[...body.querySelectorAll('.home-shop-cart [aria-label]')].find(node=>node.getAttribute('aria-label')===focusLabel&&!node.disabled) ?? body.querySelector('.home-shop-cart-heading');
      target?.focus({preventScroll:true});
    }
  }

  async function checkoutCart() {
    if (busy || !cartLines().length) return;
    busy = true;
    report("DisplayText3336, DisplayText3345.");
    render();
    let success = false;
    try {
      const result = await onCheckout();
      if (result?.ok === false) report(resultMessage(result, "DisplayText3346, DisplayText3347."), true);
      else {
        receipt = result?.order ?? state().orders?.at(-1) ?? null;
        activeTab = 'inventory';
        mobilePanel = null;
        inventoryFilter = 'stored';
        inventoryScope = 'all';
        query = '';
        success = true;
        const clothingOnly = receipt?.lines?.length && receipt.lines.every(line => productById.get(line.skuId)?.productType === 'clothing');
        report(clothingOnly ? "DisplayText3348, DisplayText3349.DisplayText2532[DisplayText3350]DisplayText3351[DisplayText3352]DisplayText3353." : accountMode ? "DisplayText3348, DisplayText3354.DisplayText3355, DisplayText3356, DisplayText3357." : "DisplayText3348, DisplayText3358.DisplayText3355, DisplayText3356, DisplayText3357.");
      }
    } catch { report("DisplayText3346, DisplayText0974; DisplayText3359, DisplayText3360.", true); }
    finally {
      busy = false;
      render();
      if (success) body.querySelector('[data-shop-start-placement], [data-shop-place]')?.focus({ preventScroll: true });
    }
  }

  async function place(item) {
    if (busy) return;
    const clothing = productById.get(item.skuId)?.productType === 'clothing';
    busy = true;
    try {
      const result = await onPlace(item.id);
      if (result?.ok === false) { report(resultMessage(result, clothing ? "DisplayText3361, DisplayText3362." : "DisplayText3363, DisplayText3364."), true); return; }
      busy = false;
      close();
    } catch { report(clothing ? "DisplayText3361, DisplayText3362." : "DisplayText3363, DisplayText3365.", true); }
    finally { busy = false; if (dialog.open) render(); }
  }

  async function sell(item){
    if(busy||!onSell)return;
    const quote=getResaleQuote?.(item.id);if(!quote?.ok){report(quote?.error??"DisplayText3366.",true);return;}
    busy=true;report("DisplayText3367…");render();
    try{
      const result=await onSell(item.id);
      if(result?.ok===false)report(resultMessage(result,"DisplayText3368, DisplayText3369."),true);
      else report(`DisplayText3370, DisplayText3371 ${number(result?.receipt?.creditAmount??quote.quote.amount)} DisplayText0007.`);
    }catch{report("DisplayText3372, DisplayText3373.",true);}
    finally{busy=false;render();}
  }

  function renderInventory() {
    const inventory = element('section', 'home-shop-inventory');
    const resaleOnly=activeTab==='resale';
    const owned = (state().owned ?? []).filter(item=>item.status!=='sold'&&(!resaleOnly||['furniture','outdoor'].includes(productById.get(item.skuId)?.productType)));
    const usageOf = item => inventoryUsageStatus(item, productById.get(item.skuId), state().avatar);
    const scoped = owned.filter(item => inventoryScope === 'all' || shopInventoryScope(productById.get(item.skuId)) === inventoryScope);
    const receiptItems = receipt ? owned.filter(item => receipt.ownedIds?.includes(item.id) && usageOf(item) === 'stored') : [];
    if (!resaleOnly && receipt && receiptItems.length) {
      const receiptBox = element('div', 'home-shop-receipt');
      const text = element('div');
      const hasClothing = receiptItems.some(item => productById.get(item.skuId)?.productType === 'clothing');
      const onlyClothing = hasClothing && receiptItems.every(item => productById.get(item.skuId)?.productType === 'clothing');
      text.append(element('strong', '', onlyClothing ? "DisplayText3374" : "DisplayText3375"), element('p', '', `DisplayText3376 ${number(receipt.total)} DisplayText0920, DisplayText3377 ${receiptItems.length} DisplayText3378.${onlyClothing ? "DisplayText3379, DisplayText3380." : hasClothing ? "DisplayText3381; DisplayText3382." : "DisplayText3383, DisplayText3384."}`));
      const firstProduct = productById.get(receiptItems[0].skuId);
      const start = button(`${firstProduct?.productType === 'clothing' ? "DisplayText3350" : ['room', 'storey'].includes(firstProduct?.productType) ? "DisplayText3385" : firstProduct?.productType === 'outdoor' ? "DisplayText3386: " : "DisplayText3387"}[${firstProduct?.name ?? "DisplayText3388"}]`, 'home-shop-primary', () => place(receiptItems[0]));
      start.dataset.shopStartPlacement = '';
      receiptBox.append(text, start);
      inventory.append(receiptBox);
    }
    const toolbar = element('div', 'home-shop-inventory-toolbar');
    const scopes = element('div','home-shop-categories');scopes.setAttribute('aria-label',"DisplayText3389");
    for (const [id,label] of [['all',"DisplayText3390"],['indoor',resaleOnly?"DisplayText3391":"DisplayText3392"],['outdoor',"DisplayText3393"],...!resaleOnly&&products.some(product => product.productType === 'clothing')?[['clothing',accountMode?"DisplayText3394":"DisplayText3395"]]:[]]) {
      const count=owned.filter(item=>id==='all'||shopInventoryScope(productById.get(item.skuId))===id).length;
      const choice=button(`${label} ${count}`,'home-shop-category',()=>{inventoryScope=id;render();});
      choice.dataset.shopInventoryScope=id;choice.setAttribute('aria-pressed',String(inventoryScope===id));choice.classList.toggle('is-active',inventoryScope===id);scopes.append(choice);
    }
    toolbar.append(scopes);
    const filters = element('div', 'home-shop-categories');
    filters.setAttribute('aria-label',"DisplayText3396");
    for (const [id, name] of [['stored', inventoryScope === 'clothing' ? "DisplayText3397" : "DisplayText3398"], ['placed', resaleOnly?"DisplayText3399":inventoryScope === 'clothing' ? "DisplayText3400" : "DisplayText3399 / DisplayText3401"], ['all', "All"]]) {
      const count = scoped.filter(item => id === 'all' || usageOf(item) === id).length;
      const filter = button(`${name} (${count})`, 'home-shop-category', () => { inventoryFilter = id; render(); });
      filter.dataset.shopInventoryFilter = id;
      filter.classList.toggle('is-active', inventoryFilter === id);
      filter.setAttribute('aria-pressed', String(inventoryFilter === id));
      filters.append(filter);
    }
    toolbar.append(filters, element('p', '', resaleOnly ? "DisplayText3402 50% DisplayText3403, DisplayText3404.DisplayText3405, DisplayText3406.Room, DisplayText3407." : accountMode ? "DisplayText3408, DisplayText3409, DisplayText3410." : "Furniture, DisplayText3342, DisplayText3411.DisplayText3412, DisplayText3413."));
    inventory.append(toolbar);
    const grid = element('div', 'home-shop-products home-shop-inventory-grid');
    const visible = scoped.filter(item => inventoryFilter === 'all' || usageOf(item) === inventoryFilter);
    if (!visible.length) emptyState(grid, resaleOnly?"DisplayText3414":inventoryScope === 'clothing' ? "DisplayText3415" : inventoryFilter === 'placed' ? "DisplayText3416" : "DisplayText3417", resaleOnly?"DisplayText3418, DisplayText3419; DisplayText3420.":inventoryScope === 'clothing' ? "DisplayText3421, DisplayText3422." : inventoryFilter === 'placed' ? "DisplayText3423, DisplayText3424, DisplayText3425." : "DisplayText3426, DisplayText3427.", "DisplayText3428", () => switchTab(['outdoor','clothing'].includes(inventoryScope) ? inventoryScope : 'shop'));
    for (const item of visible) {
      const product = productById.get(item.skuId) ?? { skuId: item.skuId, kind: item.item?.kind, name: "DisplayText3429", description: "DisplayText3430" };
      const card = element('article', 'home-shop-product');
      card.dataset.shopOwned = item.id;
      card.append(imageFor(product, item.item));
      const details = element('div', 'home-shop-product-details');
      details.append(element('h3', 'home-shop-product-name', product.name));
      const location = element('span', 'home-shop-location', placementLabels[productPlacement(product)] ?? "DisplayText1425");
      location.dataset.placement = productPlacement(product);
      details.append(location);
      const worn = product.productType === 'clothing' && usageOf(item) === 'placed';
      const metadata = [item.source === 'gift' ? (item.item?.legacyIncludedExtras ? "DisplayText3431" : "DisplayText3432") : "DisplayText3433", product.productType === 'clothing' ? worn ? "DisplayText3400" : "DisplayText3397" : item.status === 'placed' ? (['room', 'storey'].includes(product.productType) ? "DisplayText3434" : product.productType === 'outdoor' ? "DisplayText3435" : `${(item.storey ?? 0) + 1} DisplayText3436`) : "DisplayText3398"];
      details.append(element('p', 'home-shop-owned-meta', metadata.join(' · ')));
      if (product.productType === 'room') {
        const r=roomRect(item.item),width=r?.width??product.cols*CELL.width,depth=r?.depth??product.rows*CELL.depth;
        details.append(element('p','home-shop-dimensions',`${number(width)} × ${number(depth)} m · ${number(Number((width*depth).toFixed(2)))} sqm · DisplayText3437`));
      }
      if (!resaleOnly && product.productType === 'clothing') {
        const wear = button(worn ? "DisplayText3400" : "DisplayText3352", 'home-shop-place', () => place(item));
        wear.dataset.shopPlace = item.id; wear.disabled = busy || worn;
        details.append(wear, element('p','home-shop-placement-note',"DisplayText3438, DisplayText3439, DisplayText3440."));
      } else if (!resaleOnly && item.status === 'stored') {
        const mount = productPlacement(product);
        const put = button(mount === 'storey' ? "DisplayText3441" : mount === 'room' ? "DisplayText3442" : mount === 'outdoor' ? "DisplayText3386" : mount === 'wall' ? "DisplayText3443" : mount === 'table' ? "DisplayText3444" : "DisplayText3445", 'home-shop-place', () => place(item));
        put.dataset.shopPlace = item.id;
        put.disabled = busy;
        details.append(put, element('p', 'home-shop-placement-note', mount === 'storey' ? "DisplayText3446; DisplayText3447, DisplayText3448." : mount === 'room' ? "DisplayText3449, DisplayText3450; DisplayText3451." : mount === 'outdoor' ? "DisplayText3452; DisplayText3453, Esc Cancel.DisplayText3454." : mount === 'wall' ? "DisplayText3455, DisplayText3456." : mount === 'table' ? "DisplayText3457, DisplayText3458." : "DisplayText3459, DisplayText3458."));
      } else if(!resaleOnly) details.append(element('p', 'home-shop-placement-note', product.productType === 'storey' ? "DisplayText3460, DisplayText3461." : product.productType === 'room' ? "DisplayText3462.DisplayText3463, DisplayText3464." : product.productType === 'outdoor' ? "DisplayText3465, DisplayText3466." : "DisplayText3467, DisplayText3468."));
      if(onSell&&['furniture','outdoor'].includes(product.productType)){
        const quote=getResaleQuote?.(item.id),resell=button(quote?.ok?`DisplayText3469 · +${number(quote.quote.amount)} DisplayText0920`:"DisplayText3470",'home-shop-place',()=>sell(item));
        resell.dataset.shopSell=item.id;resell.disabled=busy||!quote?.ok;
        details.append(resell,element('p','home-shop-placement-note',quote?.ok?`DisplayText3471 ${number(quote.quote.paidUnitPrice)} DisplayText0920 · DisplayText3403 50%${item.status==='placed'?" · DisplayText3472":''}`:quote?.error??"DisplayText3473."));
      }
      card.append(details);
      grid.append(card);
    }
    inventory.append(grid);
    body.append(inventory);
  }

  function renderOrders() {
    const section = element('section', 'home-shop-orders');
    const orders = [...(state().orders ?? [])].reverse();
    section.append(element('p', 'home-shop-orders-description', accountMode ? "DisplayText3474, DisplayText3475.DisplayText3476." : "Furniture, DisplayText3342, DisplayText3409, DisplayText3477.DisplayText3478."));
    if (!orders.length && !state().areaLedger?.length && !state().constructionLedger?.length) emptyState(section, "DisplayText3479", "DisplayText3480, DisplayText3481.", "DisplayText3428", () => switchTab('shop'));
    for(const entry of [...(state().resaleLedger??[])].reverse()){
      const article=element('article','home-shop-order');
      article.append(element('h3','',`${productById.get(entry.skuId)?.name??"DisplayText3482"} · DisplayText3171`),element('p','',`DisplayText3471 ${number(entry.paidUnitPrice)} DisplayText0920 · DisplayText3403 50%`),element('strong','',`DisplayText3371 +${number(entry.amount)} DisplayText0920`));section.append(article);
    }
    for(const entry of [...(state().constructionLedger??[])].reverse()){
      const article=element('article','home-shop-order');
      if(entry.type==='elevator-upgrade')article.append(element('h3','',`${entry.lowerStorey+1} ↔ ${entry.upperStorey+1} DisplayText0931 · DisplayText0747`),element('p','',"DisplayText3483, DisplayText0752"),element('strong','',`DisplayText3484 ${number(entry.total)} DisplayText0920`));
      else article.append(element('h3','',`${entry.storey+1} DisplayText0931 · DisplayText3485`),element('p','',`DisplayText0949 ${number(entry.addedArea)} sqm${entry.stairCost?` · DisplayText3486 ${number(entry.stairCost)} DisplayText0920`:''}`),element('strong','',`DisplayText3484 ${number(entry.total)} DisplayText0920`));section.append(article);
    }
    for (const entry of [...(state().areaLedger??[])].reverse()) {
      const article=element('article','home-shop-order');
      const owned=state().owned.find(row=>row.id===entry.roomId),product=productById.get(owned?.skuId);
      const from=Number((entry.from.width*entry.from.depth).toFixed(2)),to=Number((entry.to.width*entry.to.depth).toFixed(2));
      article.append(element('h3','',`${product?.name??"Room"} · DisplayText3487`),element('p','',`${entry.storey+1} DisplayText0931 · ${number(from)} → ${number(to)} sqm`),element('strong','',`${entry.charge<0?"DisplayText3371":"DisplayText3488"} ${number(Math.abs(entry.charge))} DisplayText0920`));
      section.append(article);
    }
    for (const order of orders) {
      const article = element('article', 'home-shop-order');
      const header = element('div', 'home-shop-order-heading');
      const date = order.createdAt ? new Date(order.createdAt) : null;
      const formattedDate = date && !Number.isNaN(date.getTime()) ? date.toLocaleString('en') : `DisplayText3489 ${order.id}`;
      const sold=(state().owned??[]).filter(item=>item.status==='sold'&&order.ownedIds?.includes(item.id)).length;
      header.append(element('h3', '', formattedDate), element('span', 'home-shop-order-status', sold?`${sold} DisplayText3490`:"DisplayText3491"));
      const list = element('ul', 'home-shop-order-lines');
      for (const line of order.lines ?? []) {
        const row = element('li');
        row.append(element('span', '', `${productById.get(line.skuId)?.name ?? "Furniture"} × ${line.quantity}`), element('strong', '', `${number(line.quantity * line.unitPrice)} DisplayText0920`));
        list.append(row);
      }
      const footer = element('div', 'home-shop-order-total');
      footer.append(element('small', '', `DisplayText3492 ${order.id}`), element('strong', '', `DisplayText3484 ${number(order.total)} DisplayText0920`));
      article.append(header, list, footer);
      section.append(article);
    }
    body.append(section);
  }

  return {
    open(tab = 'shop', kind, options = {}) {
      if (disposed) return;
      activeTab = Object.hasOwn(tabLabels,tab) && (tab!=='resale'||onSell) ? tab : 'shop';
      if(activeTab==='resale')inventoryFilter='all';
      mobilePanel = null;
      category = Object.hasOwn(categoryLabels,options.category) ? options.category : kind ? categoryOf(products.find(product => product.kind === kind) ?? {}) ?? 'all' : 'all';
      if (activeTab === 'shop' && category === 'outdoor') activeTab = 'outdoor';
      if (activeTab === 'shop' && category === 'clothing') activeTab = 'clothing';
      const legacyRoom = {reading:'study',comfort:'living',toys:'playroom',hobby:'playroom',mood:'decor',lighting:'decor',plants:'decor',wall:'decor',cleaning:'utility',laundry:'utility',hallway:'entryway'};
      room = activeTab !== 'shop' ? 'all' : SHOP_ROOMS.some(section=>section.id===options.room) ? options.room
        : SHOP_ROOMS.some(section=>section.id===category) ? category
        : legacyRoom[category] ?? (kind ? shopRoomIds(products.find(product=>product.kind===kind))[0] : null) ?? 'all';
      if(activeTab==='shop') category='all';
      if (activeTab === 'clothing' && !['outfit','headwear','footwear'].includes(category)) category = 'all';
      placement = Object.hasOwn(placementLabels, options.placement) ? options.placement : 'all';
      role = ['facility','accessory'].includes(options.role) ? options.role : activeTab === 'outdoor' && options.family ? products.find(product => shopFamily(product) === options.family)?.role ?? 'all' : 'all';
      sport = typeof options.sport === 'boolean' ? options.sport : options.family ? Boolean(products.find(product => shopFamily(product) === options.family)?.sport) : 'all';
      inventoryScope = ['outdoor','clothing'].includes(options.category) ? options.category : 'all';
      query = typeof options.query==='string'?options.query.slice(0,120):''; tier = Object.hasOwn(tierLabels,options.tier) ? options.tier : 'all'; family = products.some(product=>shopFamily(product)===options.family) ? options.family : 'all'; page=1; newOnly=false;
      report('');
      render();
      if (!dialog.open) {
        lastFocus = document.activeElement;
        dialog.showModal();
      }
      closeButton.focus({ preventScroll: true });
    },
    close,
    // Action callbacks may publish new state synchronously; the action's finally
    // block renders once and keeps the original control focused.
    refresh() { if (dialog.open && !busy) render(); },
    dispose() {
      disposed = true;
      clearTimeout(statusTimer);
      compactViewport?.removeEventListener('change', syncMobilePanels);
      thumbnailEpoch += 1;
      thumbnailObserver?.disconnect();
      if (dialog.open) dialog.close();
      dialog.remove();
      thumbnails.clear();
    },
  };
}
