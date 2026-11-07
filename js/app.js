// Client ID de Google OAuth 2.0 oficial fijado para la aplicación
const GOOGLE_CLIENT_ID_CONFIG = '920432502731-cfcp5ijfhmfuche9d3b2np3n4sp6ghu7.apps.googleusercontent.com';

// Controlador Principal de la Aplicación (Precios & Gastos PWA)
document.addEventListener('DOMContentLoaded', async () => {
  console.log('Iniciando Precios & Gastos PWA...');

  // 1. Inicializar Base de Datos y Servicios
  await window.db.ready;
  await window.bcvService.init();
  await window.backupDrive.init();
  await window.authGroups.init();

  // 2. Verificar retorno de redirección OAuth de Google (accounts.google.com)
  await checkGoogleOAuthCallback();

  // 3. Manejo de Modo de Inicio (Instalación Limpia vs Demo)
  const urlParamsInit = new URLSearchParams(window.location.search);
  const isCleanReq = urlParamsInit.get('mode') === 'clean' || urlParamsInit.get('clean') === 'true' || urlParamsInit.get('clean') === '1';
  const isDemoReq = urlParamsInit.get('mode') === 'demo' || urlParamsInit.get('demo') === 'true';
  const isCleanSaved = await window.db.getSetting('app_clean_install', false);

  if (isCleanReq) {
    await window.db.clearAllPersonalData();
    window.history.replaceState(null, '', window.location.pathname);
    showToast('✨ Instalación limpia activada: Espacio en blanco listo para usar', 'success');
  } else if (isDemoReq) {
    await window.db.setSetting('app_clean_install', false);
    await window.db.seedInitialDataIfEmpty(window.bcvService.rate);
    window.history.replaceState(null, '', window.location.pathname);
    showToast('🧪 Modo Demostración activado con datos de muestra', 'info');
  } else if (!isCleanSaved) {
    // Si la base de datos está vacía y no se había marcado instalación limpia, sembrar datos iniciales
    await window.db.seedInitialDataIfEmpty(window.bcvService.rate);
  }

  // Migración y normalización automática de atributos (peso, volumen, combos) en productos existentes
  await migrateExistingProductAttributes();

  // Inicializar Gráfica Global
  const chartContainer = document.getElementById('productChartContainer');
  window.activePriceChart = new ProductPriceChart(chartContainer);

  // Inicializar Controles de Medios Obligatorios (Íconos SVG y Fotos)
  initStoreMediaControls();
  initProductMediaControls();

  // Solicitar permiso de ubicación en tiempo real al iniciar la app
  initLocationPermissionCheck();

  // Inicializar Google Identity Services Oficial
  initGoogleOfficialGis();

  // ----------------------------------------------------
  // GESTIÓN DE MONEDA DE VISUALIZACIÓN ($ USD vs Bs. VES)
  // ----------------------------------------------------
  let activeDisplayCurrency = localStorage.getItem('app_display_currency') || 'USD';
  window.activeDisplayCurrency = activeDisplayCurrency;
  let lastPlannerPlan = null;

  function updateCurrencySwitcherUI() {
    document.querySelectorAll('.btn-toggle-curr').forEach(btn => {
      const isTarget = btn.dataset.currency === activeDisplayCurrency;
      if (isTarget) {
        btn.classList.add('bg-blue-600', 'text-white', 'shadow-md');
        btn.classList.remove('text-slate-400', 'hover:text-slate-200');
      } else {
        btn.classList.remove('bg-blue-600', 'text-white', 'shadow-md');
        btn.classList.add('text-slate-400', 'hover:text-slate-200');
      }
    });

    const globalPillText = document.getElementById('globalCurrencyToggleText');
    if (globalPillText) {
      globalPillText.textContent = activeDisplayCurrency === 'USD' ? 'USD' : 'Bs.';
    }
  }

  function formatDisplayPrice(priceUsd, targetCurrency = activeDisplayCurrency) {
    const rate = (window.bcvService && window.bcvService.rate > 0) ? window.bcvService.rate : 45.0;
    const usd = parseFloat(priceUsd) || 0;
    const ves = usd * rate;
    const isVes = targetCurrency === 'VES';

    if (isVes) {
      return {
        primary: `Bs. ${ves.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        secondary: `$ ${usd.toFixed(2)} USD`,
        usd,
        ves,
        isVes: true
      };
    } else {
      return {
        primary: `$ ${usd.toFixed(2)}`,
        secondary: `Bs. ${ves.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        usd,
        ves,
        isVes: false
      };
    }
  }
  window.formatDisplayPrice = formatDisplayPrice;

  function setDisplayCurrency(currency) {
    activeDisplayCurrency = (currency === 'VES') ? 'VES' : 'USD';
    window.activeDisplayCurrency = activeDisplayCurrency;
    localStorage.setItem('app_display_currency', activeDisplayCurrency);
    updateCurrencySwitcherUI();

    if (window.activePriceChart && window.activePriceChart.setCurrency) {
      window.activePriceChart.setCurrency(activeDisplayCurrency);
    }

    renderProducts();
    renderStoreModalProductsList();
    renderPlannerCart();
    loadPlannerProductList();

    if (lastPlannerPlan) {
      renderPlannerOptimizationCards(lastPlannerPlan);
    }
  }
  window.setDisplayCurrency = setDisplayCurrency;

  // Escuchar clics globales en botones de cambio de moneda ($ USD / Bs. VES)
  document.addEventListener('click', (e) => {
    const toggleBtn = e.target.closest('.btn-toggle-curr');
    if (toggleBtn && toggleBtn.dataset.currency) {
      e.preventDefault();
      setDisplayCurrency(toggleBtn.dataset.currency);
      return;
    }

    const globalPill = e.target.closest('#globalCurrencyToggleBtn');
    if (globalPill) {
      e.preventDefault();
      setDisplayCurrency(activeDisplayCurrency === 'USD' ? 'VES' : 'USD');
      return;
    }
  });

  // Inicializar UI de selector de moneda al cargar
  setTimeout(updateCurrencySwitcherUI, 50);

  // Variables de Estado en Memoria
  let currentActiveView = 'stores';
  let activeCompressedPhoto = null;
  let activeExtractionData = null;
  let activeScanMode = 'FACTURA';
  let activeModelTier = 'flash';
  let pendingImportPayload = null;

  // ----------------------------------------------------
  // NAVEGACIÓN ENTRE VISTAS
  // ----------------------------------------------------
  function switchView(viewName) {
    currentActiveView = viewName;

    // Actualizar botones de navegación de escritorio
    document.querySelectorAll('.desktop-nav .nav-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === viewName);
    });

    // Actualizar barra de navegación móvil
    document.querySelectorAll('.mobile-nav .mobile-nav-item').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === viewName);
    });

    // Mostrar panel activo
    document.querySelectorAll('.view-panel').forEach(panel => {
      panel.classList.toggle('active', panel.id === `view-${viewName}`);
    });

    // Renderizar datos correspondientes a la vista
    if (viewName === 'stores') renderStores();
    if (viewName === 'products') renderProducts();
    if (viewName === 'planner') loadPlannerProductList();
    if (viewName === 'scanner') {
      updateApiKeyUI();
      updateModelTierUI();
    }
    if (viewName === 'accounting') renderAccounting();
    if (viewName === 'invoices') renderInvoicesArchive();
    if (viewName === 'settings') {
      loadSettingsForm();
      updateApiKeyUI();
      updateModelTierUI();
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Event Listeners de Navegación
  document.querySelectorAll('[data-view]').forEach(el => {
    el.addEventListener('click', () => switchView(el.dataset.view));
  });

  // ----------------------------------------------------
  // GESTIÓN DE AUTENTICACIÓN GOOGLE Y ESPACIOS DE TRABAJO (GRUPOS)
  // ----------------------------------------------------
  function updateGoogleAuthUI() {
    const user = window.authGroups.getCurrentUser();
    const btnText = document.getElementById('googleAuthText');
    const loggedOutView = document.getElementById('googleLoginLoggedOutView');
    const loggedInView = document.getElementById('googleLoginLoggedInView');

    if (user) {
      if (btnText) btnText.textContent = user.displayName || user.email.split('@')[0];
      if (loggedOutView) loggedOutView.classList.add('hidden');
      if (loggedInView) {
        loggedInView.classList.remove('hidden');
        document.getElementById('userAvatarImg').src = user.photoURL;
        document.getElementById('userDisplayName').textContent = user.displayName;
        document.getElementById('userEmailText').textContent = user.email;
        document.getElementById('userGroupsCount').textContent = `${window.authGroups.groups.length} grupo(s) vinculado(s)`;
      }
    } else {
      if (btnText) btnText.textContent = 'Acceder';
      if (loggedOutView) loggedOutView.classList.remove('hidden');
      if (loggedInView) loggedInView.classList.add('hidden');
    }
  }

  function updateWorkspaceUI() {
    const activeWs = window.authGroups.getActiveWorkspace();
    const isGroup = activeWs.type === 'GROUP';

    const wsNameEl = document.getElementById('workspaceName');
    const wsIconEl = document.getElementById('workspaceIcon');
    const banner = document.getElementById('groupActiveBanner');
    const btnManageModal = document.getElementById('btnOpenManageGroupModal');

    if (wsNameEl) wsNameEl.textContent = activeWs.name;
    if (wsIconEl) wsIconEl.textContent = isGroup ? '👥' : '👤';

    // Banner de grupo
    if (banner) {
      if (isGroup) {
        banner.classList.remove('hidden');
        document.getElementById('groupBannerName').textContent = activeWs.name;
        document.getElementById('groupBannerRole').textContent = activeWs.isOwner ? '👑 Administrador' : 'Miembro';
      } else {
        banner.classList.add('hidden');
      }
    }

    // Botón de administrar grupo en el dropdown
    if (btnManageModal) {
      btnManageModal.classList.toggle('hidden', !isGroup);
    }

    // Renderizar lista en el dropdown
    const optionsContainer = document.getElementById('workspaceOptionsList');
    if (optionsContainer) {
      const groups = window.authGroups.groups;
      optionsContainer.innerHTML = `
        <button class="w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-between transition ${!isGroup ? 'bg-blue-600 text-white shadow' : 'text-slate-300 hover:bg-slate-800'}" id="optSelectPersonal">
          <span class="flex items-center gap-2"><span>👤</span> Mi Espacio Personal</span>
          ${!isGroup ? '<span>✓</span>' : ''}
        </button>
      ` + groups.map(g => {
        const isCurrent = isGroup && activeWs.id === g.id;
        return `
          <button class="w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-between transition ${isCurrent ? 'bg-blue-600 text-white shadow' : 'text-slate-300 hover:bg-slate-800'} opt-select-group" data-group-id="${g.id}">
            <span class="flex items-center gap-2 truncate"><span>👥</span> ${escapeHtml(g.name)}</span>
            ${isCurrent ? '<span>✓</span>' : ''}
          </button>
        `;
      }).join('');

      document.getElementById('optSelectPersonal').addEventListener('click', async () => {
        await window.authGroups.switchToPersonal();
        document.getElementById('workspaceDropdown').classList.add('hidden');
        showToast('Cambiado a tu Espacio Personal', 'info');
      });

      document.querySelectorAll('.opt-select-group').forEach(btn => {
        btn.addEventListener('click', async () => {
          const gId = btn.dataset.groupId;
          await window.authGroups.switchToGroup(gId);
          document.getElementById('workspaceDropdown').classList.add('hidden');
          showToast(`Cambiado al grupo ${window.authGroups.getActiveWorkspace().name}`, 'info');
        });
      });
    }
  }

  // Toggle dropdown del selector de espacio
  const wsBtn = document.getElementById('workspaceBtn');
  const wsDropdown = document.getElementById('workspaceDropdown');
  if (wsBtn && wsDropdown) {
    wsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      wsDropdown.classList.toggle('hidden');
    });

    document.addEventListener('click', (e) => {
      if (!wsDropdown.contains(e.target) && e.target !== wsBtn) {
        wsDropdown.classList.add('hidden');
      }
    });
  }

  // Auth Button
  const googleAuthBtn = document.getElementById('googleAuthBtn');
  if (googleAuthBtn) {
    googleAuthBtn.addEventListener('click', () => {
      openModal('modalGoogleLogin');
    });
  }

  // Botón directo a accounts.google.com dentro del modal
  const btnGoogleDirect = document.getElementById('btnGoogleDirectRedirect');
  if (btnGoogleDirect) {
    btnGoogleDirect.addEventListener('click', async (e) => {
      e.preventDefault();
      const clientId = await getAppGoogleClientId();
      redirectToGoogleOAuth(clientId);
    });
  }

  // Cerrar sesión
  document.getElementById('btnSignOutGoogle').addEventListener('click', async () => {
    await window.authGroups.signOut();
    await window.backupDrive.toggleDriveSync(false, null);
    updateDriveStatusUI(false);
    showToast('Sesión de Google cerrada', 'info');
    closeModal('modalGoogleLogin');
  });

  // Crear Grupo Modal
  document.getElementById('btnOpenCreateGroupModal').addEventListener('click', () => {
    wsDropdown.classList.add('hidden');
    if (!window.authGroups.isLoggedIn()) {
      showToast('Debes iniciar sesión con Google para crear un grupo', 'error');
      openModal('modalGoogleLogin');
      return;
    }
    document.getElementById('formCreateGroup').reset();
    openModal('modalCreateGroup');
  });

  document.getElementById('formCreateGroup').addEventListener('submit', async (e) => {
    e.preventDefault();
    const groupName = document.getElementById('inputGroupName').value;
    try {
      const newGroup = await window.authGroups.createGroup(groupName);
      showToast(`¡Grupo "${newGroup.name}" creado con éxito!`, 'success');
      closeModal('modalCreateGroup');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Administrar Grupo Modal
  function openGroupManagement() {
    const activeWs = window.authGroups.getActiveWorkspace();
    if (activeWs.type !== 'GROUP') return;

    document.getElementById('manageGroupName').textContent = activeWs.name;
    document.getElementById('manageGroupOwner').textContent = `Admin: ${activeWs.owner_email}`;

    const isOwner = window.authGroups.currentUser && activeWs.owner_email.toLowerCase() === window.authGroups.currentUser.email.toLowerCase();

    // Mostrar u ocultar sección de invitar miembros según rol
    document.getElementById('inviteMemberSection').style.display = isOwner ? 'block' : 'none';
    document.getElementById('deleteGroupSection').classList.toggle('hidden', !isOwner);

    // Listar miembros y sus permisos
    const membersList = document.getElementById('groupMembersList');
    membersList.innerHTML = (activeWs.members || []).map(m => {
      const isAdmin = m.toLowerCase() === activeWs.owner_email.toLowerCase();
      const canRemove = isOwner && !isAdmin;
      const perms = window.authGroups.getMemberPermissions(activeWs.id, m);

      return `
        <div class="p-3.5 rounded-xl bg-slate-800/80 border border-slate-700/70 text-xs space-y-2.5">
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2 min-w-0">
              <span class="text-base flex-shrink-0">${isAdmin ? '👑' : '👤'}</span>
              <div class="truncate">
                <span class="font-bold text-slate-100 block truncate">${escapeHtml(m)}</span>
                <span class="text-[10px] font-semibold ${isAdmin ? 'text-amber-400' : 'text-slate-400'}">
                  ${isAdmin ? '👑 Administrador Principal' : 'Miembro del Grupo'}
                </span>
              </div>
            </div>
            ${canRemove ? `
              <button class="btn btn-outline-danger btn-sm text-[10px] py-1 px-2.5 btn-remove-member flex-shrink-0" data-email="${escapeHtml(m)}">
                Expulsar
              </button>
            ` : ''}
          </div>

          <!-- Permisos del Miembro -->
          ${isAdmin ? `
            <div class="bg-amber-500/10 border border-amber-500/20 rounded-lg p-2 text-[11px] text-amber-300 flex items-center gap-2">
              <span>🛡️</span>
              <span>Control total: Administra miembros, catálogo, carros de compra y valoraciones.</span>
            </div>
          ` : `
            <div class="pt-2.5 border-t border-slate-700/60 space-y-2">
              <div class="flex items-center justify-between text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                <span>Permisos de este Miembro</span>
                <span>${isOwner ? '⚡ Haz clic para activar o revocar' : '🔒 Solo editable por Admin'}</span>
              </div>

              <!-- Permiso 1: Catálogo -->
              <label class="flex items-center gap-2.5 p-2 rounded-lg bg-slate-900/60 border border-slate-800 ${isOwner ? 'cursor-pointer hover:border-slate-700 transition' : 'opacity-85'}">
                <input type="checkbox" class="perm-checkbox w-4 h-4 rounded text-blue-500 border-slate-700 bg-slate-800 focus:ring-0 ${!isOwner ? 'pointer-events-none' : ''}"
                  data-email="${escapeHtml(m)}" data-perm="can_manage_catalog" ${perms.can_manage_catalog ? 'checked' : ''} ${!isOwner ? 'disabled' : ''}>
                <div class="min-w-0 flex-1">
                  <div class="font-bold text-slate-200 text-xs flex items-center gap-1.5">
                    <span>📦</span>
                    <span>Gestionar Catálogo</span>
                  </div>
                  <div class="text-[10px] text-slate-400">Poder agregar, eliminar o editar productos y tiendas existentes.</div>
                </div>
              </label>

              <!-- Permiso 2: Carro de compras -->
              <label class="flex items-center gap-2.5 p-2 rounded-lg bg-slate-900/60 border border-slate-800 ${isOwner ? 'cursor-pointer hover:border-slate-700 transition' : 'opacity-85'}">
                <input type="checkbox" class="perm-checkbox w-4 h-4 rounded text-blue-500 border-slate-700 bg-slate-800 focus:ring-0 ${!isOwner ? 'pointer-events-none' : ''}"
                  data-email="${escapeHtml(m)}" data-perm="can_manage_cart" ${perms.can_manage_cart ? 'checked' : ''} ${!isOwner ? 'disabled' : ''}>
                <div class="min-w-0 flex-1">
                  <div class="font-bold text-slate-200 text-xs flex items-center gap-1.5">
                    <span>🛒</span>
                    <span>Carro de Mercado</span>
                  </div>
                  <div class="text-[10px] text-slate-400">Poder agregar o quitar productos del carro de compras.</div>
                </div>
              </label>

              <!-- Permiso 3: Votar sobre la calidad del producto -->
              <label class="flex items-center gap-2.5 p-2 rounded-lg bg-slate-900/60 border border-slate-800 ${isOwner ? 'cursor-pointer hover:border-slate-700 transition' : 'opacity-85'}">
                <input type="checkbox" class="perm-checkbox w-4 h-4 rounded text-amber-500 border-slate-700 bg-slate-800 focus:ring-0 ${!isOwner ? 'pointer-events-none' : ''}"
                  data-email="${escapeHtml(m)}" data-perm="can_rate_products" ${perms.can_rate_products ? 'checked' : ''} ${!isOwner ? 'disabled' : ''}>
                <div class="min-w-0 flex-1">
                  <div class="font-bold text-slate-200 text-xs flex items-center gap-1.5">
                    <span>⭐</span>
                    <span>Votar Calidad del Producto</span>
                    <span class="text-[9px] px-1 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-semibold">Activo por defecto</span>
                  </div>
                  <div class="text-[10px] text-slate-400">Calificar calidad con estrellas (1 a 5). Desmarca si deseas quitarle el permiso de votar.</div>
                </div>
              </label>
            </div>
          `}
        </div>
      `;
    }).join('');

    // Listener para remover miembros
    document.querySelectorAll('.btn-remove-member').forEach(btn => {
      btn.addEventListener('click', async () => {
        const emailToRemove = btn.dataset.email;
        if (confirm(`¿Remover a ${emailToRemove} de este grupo? Ya no podrá acceder a las tiendas ni precios.`)) {
          try {
            await window.authGroups.removeMember(activeWs.id, emailToRemove);
            showToast(`${emailToRemove} ha sido removido del grupo`, 'info');
            openGroupManagement();
          } catch (err) {
            showToast(err.message, 'error');
          }
        }
      });
    });

    // Listeners para modificar permisos de miembros (Solo si es Administrador)
    if (isOwner) {
      membersList.querySelectorAll('.perm-checkbox').forEach(cb => {
        cb.addEventListener('change', async (e) => {
          const email = e.target.dataset.email;
          const permKey = e.target.dataset.perm;
          const isChecked = e.target.checked;
          const permLabels = {
            can_manage_catalog: 'Gestión de catálogo',
            can_manage_cart: 'Modificar carro de mercado',
            can_rate_products: 'Votar calidad de productos'
          };
          try {
            await window.authGroups.updateMemberPermission(activeWs.id, email, permKey, isChecked);
            const statusText = isChecked ? 'concedido' : 'revocado';
            showToast(`Permiso "${permLabels[permKey]}" ${statusText} para ${email}`, isChecked ? 'success' : 'info');
          } catch (err) {
            e.target.checked = !isChecked; // revertir en caso de error
            showToast(err.message, 'error');
          }
        });
      });
    }

    openModal('modalManageGroup');
  }

  document.getElementById('btnOpenManageGroupModal').addEventListener('click', () => {
    wsDropdown.classList.add('hidden');
    openGroupManagement();
  });
  document.getElementById('btnBannerManageGroup').addEventListener('click', openGroupManagement);

  // Formulario para invitar miembro por correo (Validación @gmail.com)
  document.getElementById('formInviteMember').addEventListener('submit', async (e) => {
    e.preventDefault();
    const activeWs = window.authGroups.getActiveWorkspace();
    const emailInput = document.getElementById('inputInviteMemberEmail');
    const emailToInvite = (emailInput.value || '').trim().toLowerCase();

    if (!emailToInvite.endsWith('@gmail.com') || emailToInvite === '@gmail.com') {
      showToast('⚠️ El correo debe terminar en @gmail.com para asegurar que sea de Google', 'error');
      emailInput.focus();
      return;
    }

    try {
      await window.authGroups.inviteMember(activeWs.id, emailToInvite);
      showToast(`¡Invitación registrada! ${emailToInvite} podrá unirse al iniciar sesión con Google.`, 'success');
      emailInput.value = '';
      openGroupManagement();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Eliminar grupo
  document.getElementById('btnDeleteCurrentGroup').addEventListener('click', async () => {
    const activeWs = window.authGroups.getActiveWorkspace();
    if (confirm(`¿Estás seguro de eliminar el grupo "${activeWs.name}" y todos sus datos compartidos?`)) {
      await window.db.deleteGroup(activeWs.id);
      await window.authGroups.switchToPersonal();
      closeModal('modalManageGroup');
      showToast('Grupo eliminado correctamente', 'info');
    }
  });

  // Suscribirse a cambios en Auth y Workspaces
  window.authGroups.subscribe(() => {
    updateWorkspaceUI();
    updateGoogleAuthUI();
    updateDriveStatusUI(window.backupDrive.syncEnabled);
    if (currentActiveView === 'stores') renderStores();
    if (currentActiveView === 'products') renderProducts();
    if (currentActiveView === 'planner') loadPlannerProductList();
  });
  updateWorkspaceUI();
  updateGoogleAuthUI();
  updateDriveStatusUI(window.backupDrive.syncEnabled);

  // Modal Copiar Todo del Grupo al Espacio Personal
  document.getElementById('btnBannerCopyAll').addEventListener('click', () => {
    const activeWs = window.authGroups.getActiveWorkspace();
    document.getElementById('copyGroupSourceTitle').textContent = `"${activeWs.name}"`;
    openModal('modalCopyGroup');
  });

  document.getElementById('btnConfirmCopyAllGroup').addEventListener('click', async () => {
    const updatePrices = document.getElementById('chkCopyUpdatePrices').checked;
    showToast('Clonando biblioteca a tu espacio personal...', 'info');

    try {
      const res = await window.authGroups.copyAllActiveGroupToPersonal({
        updatePriceIfExisting: updatePrices
      });

      showToast(`¡Copia lista! ${res.createdProducts} productos nuevos y ${res.updatedProducts} actualizados en tu espacio personal.`, 'success');
      closeModal('modalCopyGroup');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // ----------------------------------------------------
  // GESTIÓN DE TASA BCV
  // ----------------------------------------------------
  function updateBcvUI(rate) {
    const textEl = document.getElementById('bcvPillText');
    if (textEl) {
      textEl.textContent = `BCV: Bs. ${rate.toFixed(2)}`;
    }
    const inputRate = document.getElementById('inputManualBcvRate');
    if (inputRate) {
      inputRate.value = rate.toFixed(2);
    }
  }

  window.bcvService.subscribe((rate) => {
    updateBcvUI(rate);
    updateCurrencySwitcherUI();
    // Si la moneda activa es VES o la vista actual lo requiere, refrescar dinámicamente
    if (currentActiveView === 'products' || activeDisplayCurrency === 'VES') {
      renderProducts();
    }
    if (currentActiveView === 'planner' || activeDisplayCurrency === 'VES') {
      renderPlannerCart();
      loadPlannerProductList();
      if (lastPlannerPlan) renderPlannerOptimizationCards(lastPlannerPlan);
    }
    if (currentModalStoreId) renderStoreModalProductsList();
    if (currentActiveView === 'accounting') renderAccounting();
  });
  updateBcvUI(window.bcvService.rate);

  // Modal BCV
  document.getElementById('bcvPillBtn').addEventListener('click', () => {
    openModal('modalBcv');
  });

  document.getElementById('btnFetchOnlineBcv').addEventListener('click', async () => {
    showToast('Consultando tasa oficial en línea...', 'info');
    try {
      const rate = await window.bcvService.fetchLiveRate();
      showToast(`Tasa actualizada con éxito: Bs. ${rate.toFixed(2)}`, 'success');
      closeModal('modalBcv');
    } catch (err) {
      showToast('No se pudo obtener la tasa en línea. Escríbela manualmente.', 'error');
    }
  });

  document.getElementById('btnSaveManualBcv').addEventListener('click', async () => {
    const val = parseFloat(document.getElementById('inputManualBcvRate').value);
    if (!isNaN(val) && val > 0) {
      await window.bcvService.setManualRate(val);
      showToast(`Tasa manual establecida: Bs. ${val.toFixed(2)}`, 'success');
      closeModal('modalBcv');
    } else {
      showToast('Ingresa un número válido para la tasa', 'error');
    }
  });

  // ----------------------------------------------------
  // GESTIÓN DE MODALES
  // ----------------------------------------------------
  function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add('active');
  }

  function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('active');
  }

  document.querySelectorAll('[data-modal]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      closeModal(btn.dataset.modal);
    });
  });

  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.classList.remove('active');
      }
    });
  });

  // Toast Notifications
  function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '⚠️';

    toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  // ----------------------------------------------------
  // GESTIÓN DE MEDIOS (FOTOS E ICONOS SVG OBLIGATORIOS)
  // ----------------------------------------------------
  function initStoreMediaControls() {
    const grid = document.getElementById('storeIconGrid');
    if (!grid || !window.AppIcons) return;

    grid.innerHTML = Object.values(window.AppIcons.stores).map(icon => `
      <button type="button" class="btn-store-icon-choice p-2 rounded-xl flex flex-col items-center justify-center gap-1 border border-slate-700/60 hover:border-blue-500 hover:bg-slate-800 transition" data-id="${icon.id}" title="${icon.name}">
        <div class="w-6 h-6 flex items-center justify-center pointer-events-none" style="color: ${icon.color};">
          ${icon.svg}
        </div>
        <span class="text-[9px] text-slate-300 truncate max-w-[65px] pointer-events-none">${icon.name.split('/')[0]}</span>
      </button>
    `).join('');

    updateStoreMediaPreview();

    grid.addEventListener('click', (e) => {
      const btn = e.target.closest('.btn-store-icon-choice');
      if (!btn) return;
      const iconId = btn.dataset.id;
      document.getElementById('inputStoreImageType').value = 'icon';
      document.getElementById('inputStoreImageData').value = iconId;
      updateStoreMediaPreview();
    });

    const tabIcon = document.getElementById('tabStoreIcon');
    const tabPhoto = document.getElementById('tabStorePhoto');
    const secIcon = document.getElementById('storeIconPickerSection');
    const secPhoto = document.getElementById('storePhotoUploadSection');

    if (tabIcon && tabPhoto) {
      tabIcon.addEventListener('click', () => {
        tabIcon.className = 'btn btn-primary btn-sm text-xs py-1.5 flex items-center justify-center gap-1.5';
        tabPhoto.className = 'btn btn-secondary btn-sm text-xs py-1.5 flex items-center justify-center gap-1.5';
        secIcon.classList.remove('hidden');
        secPhoto.classList.add('hidden');
        if (document.getElementById('inputStoreImageType').value === 'photo') {
          document.getElementById('inputStoreImageType').value = 'icon';
          document.getElementById('inputStoreImageData').value = 'supermarket';
          updateStoreMediaPreview();
        }
      });

      tabPhoto.addEventListener('click', () => {
        tabPhoto.className = 'btn btn-primary btn-sm text-xs py-1.5 flex items-center justify-center gap-1.5';
        tabIcon.className = 'btn btn-secondary btn-sm text-xs py-1.5 flex items-center justify-center gap-1.5';
        secPhoto.classList.remove('hidden');
        secIcon.classList.add('hidden');
      });
    }

    const photoInput = document.getElementById('inputStorePhotoFile');
    if (photoInput) {
      photoInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
          showToast('Optimizando foto en WebP...', 'info');
          const compressed = await window.imageCompressor.compressImage(file, { maxWidth: 360, quality: 0.75 });
          document.getElementById('inputStoreImageType').value = 'photo';
          document.getElementById('inputStoreImageData').value = compressed.dataUrl;
          updateStoreMediaPreview();
          showToast('Foto asignada a la tienda', 'success');
        } catch (err) {
          showToast('Error al procesar foto: ' + err.message, 'error');
        }
      });
    }
  }

  function updateStoreMediaPreview() {
    const type = document.getElementById('inputStoreImageType').value || 'icon';
    const data = document.getElementById('inputStoreImageData').value || 'supermarket';
    const previewEl = document.getElementById('storeMediaPreview');
    const labelEl = document.getElementById('storeMediaPreviewTitle');
    if (!previewEl || !window.AppIcons) return;

    if (type === 'photo' && data.startsWith('data:image')) {
      previewEl.innerHTML = `<img src="${data}" alt="Foto" class="w-full h-full object-cover rounded-xl">`;
      previewEl.style.backgroundColor = '#0f172a';
      if (labelEl) labelEl.textContent = 'Foto Personalizada';
    } else {
      const def = window.AppIcons.stores[data] || window.AppIcons.stores['supermarket'];
      previewEl.innerHTML = def.svg;
      previewEl.style.backgroundColor = def.bg;
      previewEl.style.color = def.color;
      if (labelEl) labelEl.textContent = def.name;
    }

    document.querySelectorAll('.btn-store-icon-choice').forEach(b => {
      const isSel = type === 'icon' && b.dataset.id === data;
      b.classList.toggle('ring-2', isSel);
      b.classList.toggle('ring-blue-500', isSel);
      b.classList.toggle('bg-blue-500/10', isSel);
    });
  }

  function setStoreMedia(type = 'icon', data = 'supermarket') {
    document.getElementById('inputStoreImageType').value = type || 'icon';
    document.getElementById('inputStoreImageData').value = data || 'supermarket';
    const tabIcon = document.getElementById('tabStoreIcon');
    const tabPhoto = document.getElementById('tabStorePhoto');
    const secIcon = document.getElementById('storeIconPickerSection');
    const secPhoto = document.getElementById('storePhotoUploadSection');

    if (type === 'photo') {
      if (tabPhoto) tabPhoto.className = 'btn btn-primary btn-sm text-xs py-1.5 flex items-center justify-center gap-1.5';
      if (tabIcon) tabIcon.className = 'btn btn-secondary btn-sm text-xs py-1.5 flex items-center justify-center gap-1.5';
      if (secPhoto) secPhoto.classList.remove('hidden');
      if (secIcon) secIcon.classList.add('hidden');
    } else {
      if (tabIcon) tabIcon.className = 'btn btn-primary btn-sm text-xs py-1.5 flex items-center justify-center gap-1.5';
      if (tabPhoto) tabPhoto.className = 'btn btn-secondary btn-sm text-xs py-1.5 flex items-center justify-center gap-1.5';
      if (secIcon) secIcon.classList.remove('hidden');
      if (secPhoto) secPhoto.classList.add('hidden');
    }
    updateStoreMediaPreview();
  }

  function initProductMediaControls() {
    const grid = document.getElementById('productIconGrid');
    if (!grid || !window.AppIcons) return;

    grid.innerHTML = Object.values(window.AppIcons.products).map(icon => `
      <button type="button" class="btn-product-icon-choice p-1.5 rounded-xl flex flex-col items-center justify-center gap-1 border border-slate-700/60 hover:border-blue-500 hover:bg-slate-800 transition" data-id="${icon.id}" title="${icon.name}">
        <div class="w-5 h-5 flex items-center justify-center pointer-events-none" style="color: ${icon.color};">
          ${icon.svg}
        </div>
        <span class="text-[8px] text-slate-300 truncate max-w-[55px] pointer-events-none">${icon.name.split('/')[0]}</span>
      </button>
    `).join('');

    updateProductMediaPreview();

    grid.addEventListener('click', (e) => {
      const btn = e.target.closest('.btn-product-icon-choice');
      if (!btn) return;
      const iconId = btn.dataset.id;
      document.getElementById('inputProductImageType').value = 'icon';
      document.getElementById('inputProductImageData').value = iconId;
      updateProductMediaPreview();
    });

    const tabIcon = document.getElementById('tabProductIcon');
    const tabPhoto = document.getElementById('tabProductPhoto');
    const secIcon = document.getElementById('productIconPickerSection');
    const secPhoto = document.getElementById('productPhotoUploadSection');

    if (tabIcon && tabPhoto) {
      tabIcon.addEventListener('click', () => {
        tabIcon.className = 'btn btn-primary btn-sm text-xs py-1.5 flex items-center justify-center gap-1.5';
        tabPhoto.className = 'btn btn-secondary btn-sm text-xs py-1.5 flex items-center justify-center gap-1.5';
        secIcon.classList.remove('hidden');
        secPhoto.classList.add('hidden');
        if (document.getElementById('inputProductImageType').value === 'photo') {
          document.getElementById('inputProductImageType').value = 'icon';
          document.getElementById('inputProductImageData').value = 'grain';
          updateProductMediaPreview();
        }
      });

      tabPhoto.addEventListener('click', () => {
        tabPhoto.className = 'btn btn-primary btn-sm text-xs py-1.5 flex items-center justify-center gap-1.5';
        tabIcon.className = 'btn btn-secondary btn-sm text-xs py-1.5 flex items-center justify-center gap-1.5';
        secPhoto.classList.remove('hidden');
        secIcon.classList.add('hidden');
      });
    }

    const photoInput = document.getElementById('inputProductPhotoFile');
    if (photoInput) {
      photoInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
          showToast('Optimizando foto en WebP...', 'info');
          const compressed = await window.imageCompressor.compressImage(file, { maxWidth: 360, quality: 0.75 });
          document.getElementById('inputProductImageType').value = 'photo';
          document.getElementById('inputProductImageData').value = compressed.dataUrl;
          updateProductMediaPreview();
          showToast('Foto asignada al producto', 'success');
        } catch (err) {
          showToast('Error al procesar foto: ' + err.message, 'error');
        }
      });
    }
  }

  function updateProductMediaPreview() {
    const type = document.getElementById('inputProductImageType').value || 'icon';
    const data = document.getElementById('inputProductImageData').value || 'grain';
    const previewEl = document.getElementById('productMediaPreview');
    const labelEl = document.getElementById('productMediaPreviewTitle');
    if (!previewEl || !window.AppIcons) return;

    if (type === 'photo' && data.startsWith('data:image')) {
      previewEl.innerHTML = `<img src="${data}" alt="Foto" class="w-full h-full object-cover rounded-xl">`;
      previewEl.style.backgroundColor = '#0f172a';
      if (labelEl) labelEl.textContent = 'Foto Personalizada';
    } else {
      const def = window.AppIcons.products[data] || window.AppIcons.products['grain'];
      previewEl.innerHTML = def.svg;
      previewEl.style.backgroundColor = def.bg;
      previewEl.style.color = def.color;
      if (labelEl) labelEl.textContent = def.name;
    }

    document.querySelectorAll('.btn-product-icon-choice').forEach(b => {
      const isSel = type === 'icon' && b.dataset.id === data;
      b.classList.toggle('ring-2', isSel);
      b.classList.toggle('ring-blue-500', isSel);
      b.classList.toggle('bg-blue-500/10', isSel);
    });
  }

  function setProductMedia(type = 'icon', data = 'grain') {
    document.getElementById('inputProductImageType').value = type || 'icon';
    document.getElementById('inputProductImageData').value = data || 'grain';
    const tabIcon = document.getElementById('tabProductIcon');
    const tabPhoto = document.getElementById('tabProductPhoto');
    const secIcon = document.getElementById('productIconPickerSection');
    const secPhoto = document.getElementById('productPhotoUploadSection');

    if (type === 'photo') {
      if (tabPhoto) tabPhoto.className = 'btn btn-primary btn-sm text-xs py-1.5 flex items-center justify-center gap-1.5';
      if (tabIcon) tabIcon.className = 'btn btn-secondary btn-sm text-xs py-1.5 flex items-center justify-center gap-1.5';
      if (secPhoto) secPhoto.classList.remove('hidden');
      if (secIcon) secIcon.classList.add('hidden');
    } else {
      if (tabIcon) tabIcon.className = 'btn btn-primary btn-sm text-xs py-1.5 flex items-center justify-center gap-1.5';
      if (tabPhoto) tabPhoto.className = 'btn btn-secondary btn-sm text-xs py-1.5 flex items-center justify-center gap-1.5';
      if (secIcon) secIcon.classList.remove('hidden');
      if (secPhoto) secPhoto.classList.add('hidden');
    }
    updateProductMediaPreview();
  }

  // ----------------------------------------------------
  // MODAL: PRODUCTOS DE LA TIENDA (CLICK EN TIENDA)
  // ----------------------------------------------------
  let currentModalStoreId = null;

  async function openStoreProductsModal(storeId) {
    currentModalStoreId = storeId;
    const store = await window.db.getById('stores', storeId);
    if (!store) return;

    const iconContainer = document.getElementById('storeModalIcon');
    if (window.AppIcons) {
      iconContainer.innerHTML = window.AppIcons.renderStoreMedia(store, 'w-12 h-12');
    }

    document.getElementById('storeModalName').textContent = store.name;
    document.getElementById('storeModalDesc').textContent = store.description || 'Comercio registrado';
    
    const mapsLink = store.maps_url || (store.lat && store.lng ? `https://maps.google.com/?q=${store.lat},${store.lng}` : `https://maps.google.com/?q=${encodeURIComponent(store.name)}`);
    document.getElementById('storeModalMapsLink').href = mapsLink;

    const filterInput = document.getElementById('storeModalFilterInput');
    filterInput.value = '';

    await renderStoreModalProductsList();
    openModal('modalStoreProducts');
  }

  async function renderStoreModalProductsList() {
    if (!currentModalStoreId) return;
    const container = document.getElementById('storeModalProductsList');
    const countBadge = document.getElementById('storeModalProductsCount');
    const filterTerm = (document.getElementById('storeModalFilterInput').value || '').toLowerCase().trim();

    const allProducts = await window.db.getProducts();
    const storeProducts = allProducts.filter(p => p.store_id === currentModalStoreId);
    const currentRate = window.bcvService.rate;

    countBadge.textContent = `${storeProducts.length} producto${storeProducts.length === 1 ? '' : 's'} vinculados`;

    const filtered = storeProducts.filter(p => {
      return p.name.toLowerCase().includes(filterTerm) || (p.description || '').toLowerCase().includes(filterTerm);
    });

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="text-center py-8 text-slate-500">
          <p class="text-2xl mb-1">🏷️</p>
          <p class="font-semibold text-slate-300 text-xs">No hay productos en esta tienda</p>
          <p class="text-[11px] text-slate-500 mt-1">Toca "+ Agregar Producto a esta Tienda" para añadir uno.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = filtered.map(p => {
      let rawUsd = parseFloat(p.current_price) || 0;
      if (p.original_currency === 'VES') {
        rawUsd = currentRate > 0 ? rawUsd / currentRate : 0;
      }
      const priceFormatted = formatDisplayPrice(rawUsd);

      const mediaHtml = window.AppIcons ? window.AppIcons.renderProductMedia(p, 'w-10 h-10') : '🏷️';

      const starsHtml = [1, 2, 3, 4, 5].map(starNum => {
        const isFilled = p.rating && p.rating >= starNum;
        return `<span class="star ${isFilled ? 'filled' : ''}" data-prod-id="${p.id}" data-rating="${starNum}" title="Calificar con ${starNum} estrellas">★</span>`;
      }).join('');

      const titleHtml = window.ProductUtils ? window.ProductUtils.formatTitleWithQuantity(p) : escapeHtml(p.name);
      const specsHtml = window.ProductUtils ? window.ProductUtils.formatSpecsBadge(p) : '';

      return `
        <div class="p-3 bg-slate-900/80 rounded-xl border border-slate-800 flex items-center justify-between gap-2.5 hover:border-slate-700 transition min-w-0 w-full">
          <div class="flex items-center gap-2.5 min-w-0 flex-1">
            ${mediaHtml}
            <div class="min-w-0 flex-1 truncate">
              <h4 class="font-bold text-slate-100 text-xs truncate flex items-center">${titleHtml}</h4>
              <div class="flex items-center gap-2 mt-0.5 whitespace-nowrap">
                <span class="text-xs font-black text-slate-200">${priceFormatted.primary}</span>
                <span class="text-[10px] font-semibold ${priceFormatted.isVes ? 'text-blue-400' : 'text-emerald-400'}">${priceFormatted.secondary}</span>
                ${specsHtml ? `<span>•</span> ${specsHtml}` : ''}
              </div>
            </div>
          </div>

          <div class="flex items-center gap-1.5 flex-shrink-0 ml-auto">
            <div class="star-rating store-modal-stars scale-90">
              ${starsHtml}
            </div>
            <button class="btn btn-secondary btn-sm text-[11px] py-1 px-2 btn-store-modal-chart" data-id="${p.id}" title="Ver evolución de precio">
              📈
            </button>
          </div>
        </div>
      `;
    }).join('');

    // Attach listeners in modal
    container.querySelectorAll('.store-modal-stars .star').forEach(star => {
      star.addEventListener('click', async () => {
        if (!window.authGroups.hasPermission('can_rate_products')) {
          showToast('⚠️ El administrador ha desactivado tu permiso para calificar la calidad de los productos.', 'error');
          return;
        }
        const prodId = parseInt(star.dataset.prodId);
        const rating = parseInt(star.dataset.rating);
        const prod = await window.db.getById('products', prodId);
        if (prod) {
          const res = await window.db.updateProductRatingShared(prodId, rating);
          if (res.count > 1) {
            showToast(`⭐ Calificación (${rating}★) compartida con ${res.count} tiendas para "${prod.name}"`, 'success');
          } else {
            showToast(`⭐ Calificación (${rating}★) guardada`, 'success');
          }
          await renderStoreModalProductsList();
          renderProducts();
        }
      });
    });

    container.querySelectorAll('.btn-store-modal-chart').forEach(btn => {
      btn.addEventListener('click', async () => {
        const prodId = parseInt(btn.dataset.id);
        const prod = await window.db.getById('products', prodId);
        if (prod) {
          const store = await window.db.getById('stores', prod.store_id);
          const history = await window.db.getPriceHistory(prodId);
          document.getElementById('modalChartProductName').textContent = prod.name;
          document.getElementById('modalChartStoreName').textContent = `Comercio: ${store ? store.name : 'Tienda'}`;
          if (window.activePriceChart.setCurrency) {
            window.activePriceChart.setCurrency(activeDisplayCurrency);
          }
          window.activePriceChart.setData(prod, history);
          openModal('modalPriceChart');
        }
      });
    });
  }

  document.getElementById('storeModalFilterInput').addEventListener('input', renderStoreModalProductsList);

  document.getElementById('btnStoreModalAddProduct').addEventListener('click', async () => {
    if (!window.authGroups.hasPermission('can_manage_catalog')) {
      showToast('⚠️ No tienes permiso para agregar productos en este grupo.', 'error');
      return;
    }
    if (!currentModalStoreId) return;
    await populateStoreSelect('inputProductStoreId', currentModalStoreId);
    document.getElementById('modalProductTitle').textContent = 'Nuevo Producto';
    document.getElementById('formProduct').reset();
    document.getElementById('inputProductId').value = '';
    if (document.getElementById('inputProductQuantity')) document.getElementById('inputProductQuantity').value = '';
    if (document.getElementById('inputProductWeight')) document.getElementById('inputProductWeight').value = '';
    if (document.getElementById('inputProductVolume')) document.getElementById('inputProductVolume').value = '';
    document.getElementById('inputProductCurrency').value = 'USD';
    setProductMedia('icon', 'grain');
    setModalRatingStars(0);
    if (typeof updateProductPriceHint === 'function') updateProductPriceHint();
    closeModal('modalStoreProducts');
    openModal('modalProduct');
  });

  // ----------------------------------------------------
  // 1. TIENDAS (STORES)
  // ----------------------------------------------------
  async function renderStores() {
    const storesGrid = document.getElementById('storesGrid');
    const searchTerm = (document.getElementById('storeSearchInput').value || '').toLowerCase().trim();
    const stores = await window.db.getStores();
    const products = await window.db.getProducts();
    const isGroup = window.authGroups.getActiveWorkspace().type === 'GROUP';

    const filtered = stores.filter(s => {
      return s.name.toLowerCase().includes(searchTerm) || (s.description || '').toLowerCase().includes(searchTerm);
    });

    if (filtered.length === 0) {
      storesGrid.innerHTML = `
        <div class="col-span-full text-center py-12 text-slate-500">
          <p class="text-3xl mb-2">🏪</p>
          <p class="font-semibold text-slate-300">No se encontraron tiendas</p>
          <p class="text-xs text-slate-500 mt-1">${isGroup ? 'Este grupo aún no tiene tiendas. ¡Agrega una con "+ Nueva Tienda" o escanea una factura!' : 'Registra una con el botón "+ Nueva Tienda" o escanea una factura.'}</p>
        </div>
      `;
      return;
    }

    storesGrid.innerHTML = filtered.map(store => {
      const storeProducts = products.filter(p => p.store_id === store.id);
      const mapsLink = store.maps_url || (store.lat && store.lng ? `https://maps.google.com/?q=${store.lat},${store.lng}` : `https://maps.google.com/?q=${encodeURIComponent(store.name)}`);
      const mediaHtml = window.AppIcons ? window.AppIcons.renderStoreMedia(store) : '🏪';

      return `
        <div class="app-card cursor-pointer hover:border-blue-500/60 transition group store-card" data-store-id="${store.id}">
          <div>
            <div class="card-header items-center gap-2.5 min-w-0">
              <div class="flex items-center gap-2.5 min-w-0 flex-1">
                ${mediaHtml}
                <div class="min-w-0 flex-1">
                  <h3 class="card-title text-sm sm:text-base group-hover:text-blue-400 transition truncate">${escapeHtml(store.name)}</h3>
                  <span class="card-badge mt-0.5 inline-block text-[10px] sm:text-xs">${storeProducts.length} productos</span>
                </div>
              </div>
            </div>
            <p class="card-desc mt-2">${escapeHtml(store.description || 'Sin descripción adicional')}</p>
            <div class="text-[11px] text-blue-400 font-semibold mt-2.5 flex items-center gap-1 opacity-90 group-hover:opacity-100">
              <span>👉 Toca para ver sus ${storeProducts.length} productos</span>
            </div>
          </div>
          
          <div class="card-footer mt-3" onclick="event.stopPropagation();">
            <div class="flex items-center gap-1.5 flex-wrap min-w-0">
              <a href="${mapsLink}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-sm text-xs py-1 px-2.5 text-blue-400" onclick="event.stopPropagation();">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                Maps
              </a>
              ${isGroup ? `
                <button class="btn btn-primary btn-sm text-xs py-1 px-2.5 btn-copy-store-personal" data-id="${store.id}" title="Copiar tienda y sus productos a mi espacio personal" onclick="event.stopPropagation();">
                  📥 A Personal
                </button>
              ` : ''}
            </div>
            <div class="flex items-center gap-1.5 flex-shrink-0 ml-auto" onclick="event.stopPropagation();">
              <button class="btn btn-secondary btn-sm text-xs py-1 px-2 btn-edit-store" data-id="${store.id}" title="Editar tienda" onclick="event.stopPropagation();">
                ✏️
              </button>
              <button class="btn btn-outline-danger btn-sm text-xs py-1 px-2 btn-delete-store" data-id="${store.id}" title="Eliminar tienda" onclick="event.stopPropagation();">
                🗑️
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Click en la tarjeta de tienda abre el modal de productos
    document.querySelectorAll('.store-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('button') || e.target.closest('a') || e.target.closest('.card-footer')) {
          return;
        }
        const storeId = parseInt(card.dataset.storeId);
        openStoreProductsModal(storeId);
      });
    });

    // Attach listeners
    document.querySelectorAll('.btn-copy-store-personal').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const storeId = parseInt(btn.dataset.id);
        btn.disabled = true;
        btn.textContent = 'Copiando...';
        try {
          const res = await window.authGroups.copyStoreToPersonal(storeId);
          showToast(`¡Tienda "${res.storeName}" copiada a tu espacio personal! (${res.createdCount} productos nuevos, ${res.updatedCount} actualizados)`, 'success');
        } catch (err) {
          showToast(err.message, 'error');
        } finally {
          btn.disabled = false;
          btn.textContent = '📥 A Personal';
        }
      });
    });

    document.querySelectorAll('.btn-edit-store').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!window.authGroups.hasPermission('can_manage_catalog')) {
          showToast('⚠️ No tienes permiso para editar tiendas en este grupo.', 'error');
          return;
        }
        const store = await window.db.getById('stores', parseInt(btn.dataset.id));
        if (store) {
          document.getElementById('modalStoreTitle').textContent = 'Editar Tienda';
          document.getElementById('inputStoreId').value = store.id;
          document.getElementById('inputStoreName').value = store.name;
          document.getElementById('inputStoreMapsUrl').value = store.maps_url || '';
          document.getElementById('inputStoreLat').value = store.lat || '';
          document.getElementById('inputStoreLng').value = store.lng || '';
          document.getElementById('inputStoreDesc').value = store.description || '';
          setStoreMedia(store.image_type || 'icon', store.image_data || 'supermarket');
          openModal('modalStore');
        }
      });
    });

    document.querySelectorAll('.btn-delete-store').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!window.authGroups.hasPermission('can_manage_catalog')) {
          showToast('⚠️ No tienes permiso para eliminar tiendas en este grupo.', 'error');
          return;
        }
        if (confirm('¿Eliminar esta tienda y todos sus productos registrados?')) {
          await window.db.deleteStore(parseInt(btn.dataset.id));
          showToast('Tienda eliminada', 'info');
          renderStores();
        }
      });
    });
  }

  document.getElementById('storeSearchInput').addEventListener('input', renderStores);

  document.getElementById('btnNewStore').addEventListener('click', () => {
    if (!window.authGroups.hasPermission('can_manage_catalog')) {
      showToast('⚠️ No tienes permiso para registrar nuevas tiendas en este grupo.', 'error');
      return;
    }
    document.getElementById('modalStoreTitle').textContent = 'Nueva Tienda';
    document.getElementById('formStore').reset();
    document.getElementById('inputStoreId').value = '';
    setStoreMedia('icon', 'supermarket');
    openModal('modalStore');
  });

  document.getElementById('formStore').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      if (!window.authGroups.hasPermission('can_manage_catalog')) {
        showToast('⚠️ No tienes permiso para agregar o editar tiendas en este grupo.', 'error');
        return;
      }
      const idVal = document.getElementById('inputStoreId').value.trim();
      const name = document.getElementById('inputStoreName').value.trim();
      let mapsUrl = document.getElementById('inputStoreMapsUrl').value.trim();
      const lat = parseFloat(document.getElementById('inputStoreLat').value) || null;
      const lng = parseFloat(document.getElementById('inputStoreLng').value) || null;
      const desc = document.getElementById('inputStoreDesc').value.trim();
      const imageType = document.getElementById('inputStoreImageType').value || 'icon';
      const imageData = document.getElementById('inputStoreImageData').value || 'supermarket';

      if (!name) {
        showToast('Por favor ingresa el nombre de la tienda', 'error');
        return;
      }

      if (!mapsUrl) {
        mapsUrl = `https://maps.google.com/?q=${encodeURIComponent(name)}`;
      }

      const storePayload = {
        name,
        maps_url: mapsUrl,
        lat,
        lng,
        description: desc,
        image_type: imageType,
        image_data: imageData
      };
      if (idVal) {
        storePayload.id = parseInt(idVal, 10);
      }

      await window.db.saveStore(storePayload);

      // Notificación si se guardó en un espacio de grupo
      const activeWs = window.authGroups.getActiveWorkspace();
      if (activeWs && activeWs.type === 'GROUP' && window.db.addNotification) {
        try {
          const user = window.authGroups.getCurrentUser();
          const uName = user ? (user.displayName || user.email) : 'Un miembro';
          await window.db.addNotification({
            recipient_email: 'ALL_GROUP_MEMBERS',
            sender_email: user ? user.email : null,
            sender_name: uName,
            group_id: activeWs.id,
            group_name: activeWs.name,
            type: 'CATALOG',
            title: idVal ? `✏️ Tienda editada en "${activeWs.name}"` : `🏪 Nueva tienda en "${activeWs.name}"`,
            message: `${uName} ${idVal ? 'actualizó' : 'registró'} la tienda "${name}".`,
            data: { groupId: activeWs.id, storeName: name }
          });
          if (typeof updateNotificationBadge === 'function') updateNotificationBadge();
        } catch (errNotif) {
          console.warn('Error al registrar notificación de tienda:', errNotif);
        }
      }

      showToast('Tienda guardada con éxito', 'success');
      closeModal('modalStore');
      renderStores();
    } catch (err) {
      console.error('Error al guardar tienda:', err);
      showToast('Error al guardar tienda: ' + err.message, 'error');
    }
  });

  // ----------------------------------------------------
  // 2. PRODUCTOS (PRODUCTS & RATINGS & DUAL PRICE)
  // ----------------------------------------------------
  async function renderProducts() {
    const productsGrid = document.getElementById('productsGrid');
    const searchTerm = (document.getElementById('productSearchInput').value || '').toLowerCase().trim();
    const storeFilter = document.getElementById('productStoreFilter').value;
    const products = await window.db.getProducts();
    const stores = await window.db.getStores();
    const storesMap = new Map(stores.map(s => [s.id, s]));
    const isGroup = window.authGroups.getActiveWorkspace().type === 'GROUP';

    // Populate select filter
    const storeSelect = document.getElementById('productStoreFilter');
    const currentVal = storeSelect.value;
    storeSelect.innerHTML = `<option value="ALL">Todas las tiendas (${stores.length})</option>` +
      stores.map(s => `<option value="${s.id}" ${currentVal == s.id ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join('');

    const currentRate = window.bcvService.rate;

    const filtered = products.filter(p => {
      const matchSearch = p.name.toLowerCase().includes(searchTerm) || (p.description || '').toLowerCase().includes(searchTerm);
      const matchStore = storeFilter === 'ALL' || p.store_id == storeFilter;
      return matchSearch && matchStore;
    });

    if (filtered.length === 0) {
      productsGrid.innerHTML = `
        <div class="col-span-full text-center py-12 text-slate-500">
          <p class="text-3xl mb-2">🏷️</p>
          <p class="font-semibold text-slate-300">No se encontraron productos</p>
          <p class="text-xs text-slate-500 mt-1">${isGroup ? 'Este grupo aún no tiene productos. Agrega uno o escanea una factura.' : 'Registra productos nuevos o escanea una factura.'}</p>
        </div>
      `;
      return;
    }

    productsGrid.innerHTML = filtered.map(prod => {
      const store = storesMap.get(prod.store_id) || { name: 'Tienda sin asignar' };

      // Conversión de precio según moneda de visualización seleccionada (USD o Bs)
      let rawUsd = parseFloat(prod.current_price) || 0;
      if (prod.original_currency === 'VES') {
        rawUsd = currentRate > 0 ? rawUsd / currentRate : 0;
      }
      const priceFormatted = formatDisplayPrice(rawUsd);

      const mediaHtml = window.AppIcons ? window.AppIcons.renderProductMedia(prod) : '🏷️';

      // Estrellas de valoración personal compartida (1 a 5)
      const starsHtml = [1, 2, 3, 4, 5].map(starNum => {
        const isFilled = prod.rating && prod.rating >= starNum;
        return `<span class="star ${isFilled ? 'filled' : ''}" data-prod-id="${prod.id}" data-rating="${starNum}" title="Calificar con ${starNum} estrellas">★</span>`;
      }).join('');

      const titleHtml = window.ProductUtils ? window.ProductUtils.formatTitleWithQuantity(prod) : escapeHtml(prod.name);
      const specsHtml = window.ProductUtils ? window.ProductUtils.formatSpecsBadge(prod) : '';

      return `
        <div class="app-card">
          <div>
            <div class="card-header items-center gap-2 min-w-0">
              <div class="flex items-center gap-2.5 min-w-0 flex-1">
                ${mediaHtml}
                <div class="min-w-0 flex-1">
                  <span class="text-[11px] font-semibold text-blue-400 block truncate">${escapeHtml(store.name)}</span>
                  <h3 class="card-title text-sm sm:text-base mt-0.5 truncate flex items-center min-w-0">${titleHtml}</h3>
                  ${specsHtml ? `<div class="mt-0.5">${specsHtml}</div>` : ''}
                </div>
              </div>
              <!-- Price Badge according to selected display currency -->
              <div class="text-right flex-shrink-0 pl-1">
                <span class="text-sm sm:text-base font-extrabold text-slate-100 block whitespace-nowrap">${priceFormatted.primary}</span>
                <span class="text-[10px] sm:text-[11px] font-semibold whitespace-nowrap ${priceFormatted.isVes ? 'text-blue-400' : 'text-emerald-400'}">${priceFormatted.secondary}</span>
              </div>
            </div>

            <p class="card-desc text-xs mt-2">${escapeHtml(prod.description || 'Sin notas adicionales')}</p>

            <!-- Star Rating (Clickable on card - shared across same name + photo) -->
            <div class="flex items-center justify-between py-1.5 px-2 bg-slate-900/60 rounded-lg border border-slate-800/80 mt-2">
              <span class="text-[11px] text-slate-400 font-medium">Calidad:</span>
              <div class="star-rating card-stars">
                ${starsHtml}
              </div>
            </div>
          </div>

          <div class="card-footer mt-3">
            <div class="flex items-center gap-1.5 flex-wrap min-w-0">
              <button class="btn btn-secondary btn-sm text-xs py-1 px-2.5 btn-view-chart" data-id="${prod.id}" title="Ver historial de precios y gráfica porcentual">
                📈 Gráfica & %
              </button>
              ${isGroup ? `
                <button class="btn btn-primary btn-sm text-xs py-1 px-2.5 btn-copy-prod-personal" data-id="${prod.id}" title="Copiar producto a mi espacio personal">
                  📥 A Personal
                </button>
              ` : ''}
            </div>
            <div class="flex items-center gap-1.5 flex-shrink-0 ml-auto">
              <button class="btn btn-secondary btn-sm text-xs py-1 px-2 btn-edit-product" data-id="${prod.id}" title="Editar producto">✏️</button>
              <button class="btn btn-outline-danger btn-sm text-xs py-1 px-2 btn-delete-product" data-id="${prod.id}" title="Eliminar producto">🗑️</button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Listener para copiar producto a personal
    document.querySelectorAll('.btn-copy-prod-personal').forEach(btn => {
      btn.addEventListener('click', async () => {
        const prodId = parseInt(btn.dataset.id);
        const prod = await window.db.getById('products', prodId);
        if (prod) {
          btn.disabled = true;
          try {
            const res = await window.authGroups.copyProductToPersonal(prod);
            const msg = res.action === 'created'
              ? `"${prod.name}" copiado a tu espacio personal.`
              : `Precio de "${prod.name}" actualizado en tu espacio personal.`;
            showToast(msg, 'success');
          } catch (err) {
            showToast(err.message, 'error');
          } finally {
            btn.disabled = false;
          }
        }
      });
    });

    // Attach click listener on stars to update rating directly (SHARED rating sync)
    document.querySelectorAll('.card-stars .star').forEach(star => {
      star.addEventListener('click', async () => {
        if (!window.authGroups.hasPermission('can_rate_products')) {
          showToast('⚠️ El administrador ha desactivado tu permiso para calificar la calidad de los productos.', 'error');
          return;
        }
        const prodId = parseInt(star.dataset.prodId);
        const rating = parseInt(star.dataset.rating);
        const prod = await window.db.getById('products', prodId);
        if (prod) {
          const res = await window.db.updateProductRatingShared(prodId, rating);
          if (res.count > 1) {
            showToast(`⭐ Calificación compartida (${rating}★) sincronizada en ${res.count} tiendas para "${prod.name}"`, 'success');
          } else {
            showToast(`⭐ Calificación guardada: ${rating}★ para "${prod.name}"`, 'success');
          }
          await renderProducts();
        }
      });
    });

    // View Price History Chart
    document.querySelectorAll('.btn-view-chart').forEach(btn => {
      btn.addEventListener('click', async () => {
        const prodId = parseInt(btn.dataset.id);
        const prod = await window.db.getById('products', prodId);
        if (prod) {
          const store = storesMap.get(prod.store_id) || { name: 'Tienda' };
          const history = await window.db.getPriceHistory(prodId);

          document.getElementById('modalChartProductName').textContent = prod.name;
          document.getElementById('modalChartStoreName').textContent = `Comercio: ${store.name}`;

          if (window.activePriceChart && window.activePriceChart.setCurrency) {
            window.activePriceChart.setCurrency(activeDisplayCurrency);
          }
          window.activePriceChart.setData(prod, history);
          openModal('modalPriceChart');
        }
      });
    });

    // Edit Product
    document.querySelectorAll('.btn-edit-product').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!window.authGroups.hasPermission('can_manage_catalog')) {
          showToast('⚠️ No tienes permiso para editar productos en este grupo.', 'error');
          return;
        }
        const prod = await window.db.getById('products', parseInt(btn.dataset.id));
        if (prod) {
          await populateStoreSelect('inputProductStoreId', prod.store_id);
          document.getElementById('modalProductTitle').textContent = 'Editar Producto';
          document.getElementById('inputProductId').value = prod.id;
          document.getElementById('inputProductName').value = prod.name;
          if (document.getElementById('inputProductQuantity')) document.getElementById('inputProductQuantity').value = prod.quantity || '';
          if (document.getElementById('inputProductWeight')) document.getElementById('inputProductWeight').value = prod.weight || '';
          if (document.getElementById('inputProductVolume')) document.getElementById('inputProductVolume').value = prod.volume || '';
          document.getElementById('inputProductPrice').value = prod.current_price;
          document.getElementById('inputProductCurrency').value = 'USD';
          document.getElementById('inputProductDesc').value = prod.description || '';
          setProductMedia(prod.image_type || 'icon', prod.image_data || 'grain');
          setModalRatingStars(prod.rating || 0);
          updateProductPriceHint();
          openModal('modalProduct');
        }
      });
    });

    // Delete Product
    document.querySelectorAll('.btn-delete-product').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!window.authGroups.hasPermission('can_manage_catalog')) {
          showToast('⚠️ No tienes permiso para eliminar productos en este grupo.', 'error');
          return;
        }
        if (confirm('¿Eliminar este producto y su historial de precios?')) {
          await window.db.deleteProduct(parseInt(btn.dataset.id));
          showToast('Producto eliminado', 'info');
          renderProducts();
        }
      });
    });
  }

  document.getElementById('productSearchInput').addEventListener('input', renderProducts);
  document.getElementById('productStoreFilter').addEventListener('change', renderProducts);

  // Modal Rating Stars Handler
  function setModalRatingStars(ratingVal) {
    document.getElementById('inputProductRating').value = ratingVal || '';
    document.querySelectorAll('#productModalRatingStars .star').forEach(star => {
      const val = parseInt(star.dataset.val);
      star.classList.toggle('filled', val <= (ratingVal || 0));
    });
  }

  document.querySelectorAll('#productModalRatingStars .star').forEach(star => {
    star.addEventListener('click', () => {
      if (!window.authGroups.hasPermission('can_rate_products')) {
        showToast('⚠️ El administrador ha desactivado tu permiso para calificar la calidad de los productos.', 'error');
        return;
      }
      setModalRatingStars(parseInt(star.dataset.val));
    });
  });

  document.getElementById('btnClearProductRating').addEventListener('click', () => {
    if (!window.authGroups.hasPermission('can_rate_products')) {
      showToast('⚠️ El administrador ha desactivado tu permiso para calificar la calidad de los productos.', 'error');
      return;
    }
    setModalRatingStars(0);
  });

  async function populateStoreSelect(selectId, selectedId = null) {
    const select = document.getElementById(selectId);
    const stores = await window.db.getStores();
    select.innerHTML = stores.map(s => `
      <option value="${s.id}" ${selectedId == s.id ? 'selected' : ''}>${escapeHtml(s.name)}</option>
    `).join('');
  }

  // Previsualización y ayuda dinámica de conversión al ingresar precio en Bs o USD
  function updateProductPriceHint() {
    const priceInput = document.getElementById('inputProductPrice');
    const currSelect = document.getElementById('inputProductCurrency');
    const hintContainer = document.getElementById('productPriceConversionHint');
    const hintText = document.getElementById('productPriceConversionHintText');
    if (!priceInput || !currSelect || !hintContainer || !hintText) return;

    const val = parseFloat(priceInput.value);
    const curr = currSelect.value;
    const rate = (window.bcvService && window.bcvService.rate > 0) ? window.bcvService.rate : 45.0;

    if (isNaN(val) || val <= 0) {
      hintContainer.classList.add('hidden');
      return;
    }

    if (curr === 'VES') {
      const usdEquiv = val / rate;
      hintText.innerHTML = `Precio ingresado en Bolívares. Se convertirá y <strong>guardará en dólares a $ ${usdEquiv.toFixed(2)} USD</strong> (Tasa oficial BCV: Bs. ${rate.toFixed(2)}). El precio en Bs no se guarda en el sistema.`;
      hintContainer.classList.remove('hidden');
    } else {
      const vesEquiv = val * rate;
      hintText.innerHTML = `Se guardará como <strong>$ ${val.toFixed(2)} USD</strong> (Equivale hoy a Bs. ${vesEquiv.toFixed(2)} a tasa oficial BCV).`;
      hintContainer.classList.remove('hidden');
    }
  }

  document.getElementById('inputProductPrice').addEventListener('input', updateProductPriceHint);
  document.getElementById('inputProductCurrency').addEventListener('change', updateProductPriceHint);

  document.getElementById('btnNewProduct').addEventListener('click', async () => {
    if (!window.authGroups.hasPermission('can_manage_catalog')) {
      showToast('⚠️ No tienes permiso para agregar productos en este grupo.', 'error');
      return;
    }
    const stores = await window.db.getStores();
    if (stores.length === 0) {
      showToast('Debes crear al menos una tienda antes de registrar productos', 'info');
      document.getElementById('modalStoreTitle').textContent = 'Nueva Tienda';
      document.getElementById('formStore').reset();
      document.getElementById('inputStoreId').value = '';
      setStoreMedia('icon', 'supermarket');
      openModal('modalStore');
      return;
    }
    await populateStoreSelect('inputProductStoreId');
    document.getElementById('modalProductTitle').textContent = 'Nuevo Producto';
    document.getElementById('formProduct').reset();
    document.getElementById('inputProductId').value = '';
    if (document.getElementById('inputProductQuantity')) document.getElementById('inputProductQuantity').value = '';
    if (document.getElementById('inputProductWeight')) document.getElementById('inputProductWeight').value = '';
    if (document.getElementById('inputProductVolume')) document.getElementById('inputProductVolume').value = '';
    document.getElementById('inputProductCurrency').value = 'USD';
    setProductMedia('icon', 'grain');
    setModalRatingStars(0);
    updateProductPriceHint();
    openModal('modalProduct');
  });

  document.getElementById('formProduct').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      if (!window.authGroups.hasPermission('can_manage_catalog')) {
        showToast('⚠️ No tienes permiso para agregar o editar productos en este grupo.', 'error');
        return;
      }
      const idVal = document.getElementById('inputProductId').value.trim();
      const storeId = parseInt(document.getElementById('inputProductStoreId').value, 10);
      const rawName = document.getElementById('inputProductName').value.trim();
      const rawQty = document.getElementById('inputProductQuantity') ? document.getElementById('inputProductQuantity').value.trim() : '';
      const rawWeight = document.getElementById('inputProductWeight') ? document.getElementById('inputProductWeight').value.trim() : '';
      const rawVolume = document.getElementById('inputProductVolume') ? document.getElementById('inputProductVolume').value.trim() : '';

      const sanitized = window.ProductUtils ? window.ProductUtils.sanitizeProductAttributes(rawName, rawWeight, rawVolume, rawQty) : { name: rawName, weight: rawWeight, volume: rawVolume, quantity: rawQty };
      const name = sanitized.name;
      const quantity = sanitized.quantity || null;
      const weight = sanitized.weight || null;
      const volume = sanitized.volume || null;

      const price = parseFloat(document.getElementById('inputProductPrice').value);
      const currency = document.getElementById('inputProductCurrency').value;
      const ratingVal = parseInt(document.getElementById('inputProductRating').value, 10) || null;
      const desc = document.getElementById('inputProductDesc').value.trim();
      const imageType = document.getElementById('inputProductImageType').value || 'icon';
      const imageData = document.getElementById('inputProductImageData').value || 'grain';
      const currentRate = (window.bcvService && window.bcvService.rate > 0) ? window.bcvService.rate : 45.0;

      if (!name) {
        showToast('Por favor ingresa el nombre del producto', 'error');
        return;
      }
      if (isNaN(storeId)) {
        showToast('Por favor selecciona una tienda para el producto', 'error');
        return;
      }
      if (isNaN(price) || price < 0) {
        showToast('Por favor ingresa un precio válido', 'error');
        return;
      }

      // Regla de Oro: Si el usuario ingresó el precio en Bolívares (VES),
      // se convierte de inmediato a dólares (USD) usando la tasa BCV del día.
      // El precio en bolívares NO se guarda en la base de datos.
      let priceInUsd = price;
      if (currency === 'VES') {
        priceInUsd = currentRate > 0 ? parseFloat((price / currentRate).toFixed(4)) : price;
      }

      const prodPayload = {
        store_id: storeId,
        name,
        quantity,
        weight,
        volume,
        current_price: priceInUsd,
        original_currency: 'USD',
        rating: ratingVal,
        description: desc,
        image_type: imageType,
        image_data: imageData
      };
      if (idVal) {
        prodPayload.id = parseInt(idVal, 10);
      }

      const saved = await window.db.saveProduct(prodPayload, 'MANUAL', currentRate);

      // Si se especificó calificación, sincronizarla automáticamente con productos idénticos
      if (ratingVal && saved && saved.id) {
        await window.db.updateProductRatingShared(saved.id, ratingVal);
      }

      const toastMsg = (currency === 'VES')
        ? `Producto guardado en USD ($ ${priceInUsd.toFixed(2)}) convertido de Bs. ${price.toFixed(2)}`
        : 'Producto guardado con éxito ($ USD)';
      showToast(toastMsg, 'success');
      closeModal('modalProduct');
      renderProducts();
      if (currentModalStoreId) renderStoreModalProductsList();

      // Notificación al grupo si se guardó en un espacio grupal
      const activeWs = window.authGroups.getActiveWorkspace();
      if (activeWs && activeWs.type === 'GROUP' && window.db.addNotification) {
        try {
          const user = window.authGroups.getCurrentUser();
          const uName = user ? (user.displayName || user.email) : 'Un miembro';
          await window.db.addNotification({
            recipient_email: 'ALL_GROUP_MEMBERS',
            sender_email: user ? user.email : null,
            sender_name: uName,
            group_id: activeWs.id,
            group_name: activeWs.name,
            type: 'CATALOG',
            title: idVal ? `✏️ Producto editado en "${activeWs.name}"` : `📦 Nuevo producto en "${activeWs.name}"`,
            message: `${uName} ${idVal ? 'actualizó' : 'registró'} el producto "${name}" a un precio de $ ${priceInUsd.toFixed(2)} USD.`,
            data: { groupId: activeWs.id, productName: name }
          });
          if (typeof updateNotificationBadge === 'function') updateNotificationBadge();
        } catch (errNotif) {
          console.warn('Error al registrar notificación de catálogo:', errNotif);
        }
      }
    } catch (err) {
      console.error('Error al guardar producto:', err);
      showToast('Error al guardar producto: ' + err.message, 'error');
    }
  });

  // ----------------------------------------------------
  // 3. ESCANEO CON IA & COMPRESIÓN EXTREMA (REGISTRO MÚLTIPLE)
  // ----------------------------------------------------
  const scanModeInvoiceBtn = document.getElementById('scanModeInvoiceBtn');
  const scanModeMenuBtn = document.getElementById('scanModeMenuBtn');
  const scanModeTableBtn = document.getElementById('scanModeTableBtn');

  function updateProcessBtnLabel() {
    const processBtn = document.getElementById('btnProcessAI');
    if (!processBtn) return;
    const isPro = activeModelTier === 'pro';
    const tierName = isPro ? 'Gemini Pro' : 'Gemini Flash';
    const icon = isPro ? '⭐' : '✨';

    if (activeScanMode === 'FACTURA') {
      processBtn.innerHTML = `${icon} Analizar Factura con ${tierName}`;
    } else if (activeScanMode === 'MENU_LISTA') {
      processBtn.innerHTML = `${icon} Escanear Menú / Lista con ${tierName}`;
    } else {
      processBtn.innerHTML = `${icon} Analizar Tablita con ${tierName}`;
    }
  }

  function setScanMode(mode) {
    activeScanMode = mode;
    const inactiveCls = 'p-2.5 sm:p-3 rounded-xl border border-slate-700 bg-slate-800 text-slate-400 hover:text-slate-200 font-semibold text-xs sm:text-sm flex items-center justify-center gap-2 transition';
    const activeCls = 'p-2.5 sm:p-3 rounded-xl border border-blue-500 bg-blue-500/10 text-blue-400 font-semibold text-xs sm:text-sm flex items-center justify-center gap-2 transition';

    if (scanModeInvoiceBtn) scanModeInvoiceBtn.className = (mode === 'FACTURA' ? activeCls : inactiveCls);
    if (scanModeMenuBtn) scanModeMenuBtn.className = (mode === 'MENU_LISTA' ? activeCls : inactiveCls);
    if (scanModeTableBtn) scanModeTableBtn.className = (mode === 'TABLA_PRECIOS' ? activeCls : inactiveCls);

    updateProcessBtnLabel();
  }

  if (scanModeInvoiceBtn) scanModeInvoiceBtn.addEventListener('click', () => setScanMode('FACTURA'));
  if (scanModeMenuBtn) scanModeMenuBtn.addEventListener('click', () => setScanMode('MENU_LISTA'));
  if (scanModeTableBtn) scanModeTableBtn.addEventListener('click', () => setScanMode('TABLA_PRECIOS'));

  document.getElementById('btnTriggerCamera').addEventListener('click', () => {
    document.getElementById('cameraFileInput').click();
  });

  document.getElementById('btnTriggerGallery').addEventListener('click', () => {
    document.getElementById('galleryFileInput').click();
  });

  async function handleImageFile(file) {
    if (!file) return;
    showToast('Comprimiendo imagen al máximo...', 'info');

    try {
      // Pipeline de Compresión Extrema
      const compressed = await ExtremeImageCompressor.compress(file, {
        maxWidth: 800,
        quality: 0.32,
        enhanceContrast: true
      });

      activeCompressedPhoto = compressed;

      // Mostrar preview y estadísticas
      document.getElementById('scanPreviewImg').src = compressed.dataUrl;
      document.getElementById('compOrigSize').textContent = compressed.originalFormatted;
      document.getElementById('compFinalSize').textContent = compressed.compressedFormatted;
      document.getElementById('compressionSavingsBadge').textContent = `${compressed.savingsPercent}% Ahorro`;

      document.getElementById('scanPreviewCard').classList.remove('hidden');
      document.getElementById('scanResultBox').classList.add('hidden');

      showToast(`Foto reducida a sólo ${compressed.compressedFormatted} (${compressed.savingsPercent}% ahorro)`, 'success');
    } catch (err) {
      console.error(err);
      showToast('Error al procesar la foto: ' + err.message, 'error');
    }
  }

  document.getElementById('cameraFileInput').addEventListener('change', (e) => {
    handleImageFile(e.target.files[0]);
  });
  document.getElementById('galleryFileInput').addEventListener('change', (e) => {
    handleImageFile(e.target.files[0]);
  });

  // Estado reactivo para los productos extraídos y seleccionados
  let scannedItems = [];

  function updateScanTotals() {
    const currency = document.getElementById('scanCurrencySelector').value;
    const currSymbol = currency === 'VES' ? 'Bs.' : '$';

    // Actualizar símbolo de moneda en todas las filas visibles
    document.querySelectorAll('.scan-curr-symbol').forEach(el => {
      el.textContent = currSymbol;
    });

    let selectedCount = 0;
    let selectedSum = 0;

    scannedItems.forEach(item => {
      if (item.selected) {
        selectedCount++;
        const p = parseFloat(item.price) || 0;
        const q = parseFloat(item.quantity) || 1;
        selectedSum += (p * q);
      }
    });

    const totalCount = scannedItems.length;
    const scanSelectedCountEl = document.getElementById('scanSelectedCount');
    const scanTotalCountEl = document.getElementById('scanTotalCount');
    const scanSelectedTotalEl = document.getElementById('scanSelectedTotal');
    const scanBadgeCountEl = document.getElementById('scanBadgeCount');
    const btnConfirmScanEl = document.getElementById('btnConfirmScan');
    const scanSelectAllChk = document.getElementById('scanSelectAllChk');

    if (scanSelectedCountEl) scanSelectedCountEl.textContent = selectedCount;
    if (scanTotalCountEl) scanTotalCountEl.textContent = totalCount;
    if (scanBadgeCountEl) scanBadgeCountEl.textContent = `${totalCount} detectados`;
    if (scanSelectedTotalEl) scanSelectedTotalEl.textContent = `${currSymbol} ${selectedSum.toFixed(2)}`;

    if (scanSelectAllChk) {
      scanSelectAllChk.checked = (totalCount > 0 && selectedCount === totalCount);
      scanSelectAllChk.indeterminate = (selectedCount > 0 && selectedCount < totalCount);
    }

    if (btnConfirmScanEl) {
      if (selectedCount === 0) {
        btnConfirmScanEl.disabled = true;
        btnConfirmScanEl.innerHTML = '⚠️ Selecciona al menos 1 producto';
      } else {
        btnConfirmScanEl.disabled = false;
        btnConfirmScanEl.innerHTML = `💾 Registrar ${selectedCount} Producto${selectedCount === 1 ? '' : 's'} Seleccionado${selectedCount === 1 ? '' : 's'}`;
      }
    }
  }

  async function refreshItemsStoreStatus() {
    const storeSelector = document.getElementById('scanStoreSelector');
    if (!storeSelector) return;
    const selectedStoreId = storeSelector.value;
    let storeProducts = [];

    if (selectedStoreId && selectedStoreId !== 'NEW_DETECTED' && selectedStoreId !== 'CUSTOM_NEW') {
      storeProducts = await window.db.getProductsByStore(selectedStoreId);
    }

    const storeProductsMap = new Set(storeProducts.map(p => p.name.trim().toLowerCase()));

    scannedItems.forEach((item, index) => {
      const clean = (item.name || '').trim().toLowerCase();
      item.isExisting = clean ? storeProductsMap.has(clean) : false;
      const statusBadge = document.getElementById(`scan-status-badge-${index}`);
      if (statusBadge) {
        if (item.isExisting) {
          statusBadge.className = 'px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 whitespace-nowrap';
          statusBadge.textContent = 'Actualizará precio';
        } else {
          statusBadge.className = 'px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 whitespace-nowrap';
          statusBadge.textContent = 'Nuevo Producto';
        }
      }
    });
  }

  function renderScannedItemsList() {
    const container = document.getElementById('extractedItemsList');
    if (!container) return;

    if (scannedItems.length === 0) {
      container.innerHTML = `
        <div class="p-6 text-center text-xs text-slate-500">
          No hay productos en la lista. Puedes añadir uno manualmente con el botón "+ Añadir producto".
        </div>
      `;
      updateScanTotals();
      return;
    }

    const currency = document.getElementById('scanCurrencySelector').value;
    const currSymbol = currency === 'VES' ? 'Bs.' : '$';

    container.innerHTML = scannedItems.map((item, index) => {
      const iconKey = item.icon || window.aiScanner.guessProductIcon(item.name);
      const iconDef = (window.AppIcons && window.AppIcons.products && window.AppIcons.products[iconKey]) || {
        color: '#94a3b8',
        bg: 'rgba(148, 163, 184, 0.15)',
        name: 'General',
        svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>`
      };

      const statusBadgeHtml = item.isExisting
        ? `<span id="scan-status-badge-${index}" class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 whitespace-nowrap">Actualizará precio</span>`
        : `<span id="scan-status-badge-${index}" class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 whitespace-nowrap">Nuevo Producto</span>`;

      return `
        <div class="p-2.5 sm:p-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 hover:bg-slate-900/60 transition" data-row-index="${index}">
          <div class="flex items-center gap-2.5 flex-1 min-w-0">
            <input type="checkbox" class="scan-item-chk rounded text-blue-600 focus:ring-blue-500 w-4 h-4 flex-shrink-0 cursor-pointer" data-index="${index}" ${item.selected ? 'checked' : ''}>
            <div id="scan-icon-box-${index}" class="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style="background: ${iconDef.bg}; color: ${iconDef.color};" title="Categoría: ${iconDef.name}">
              <div class="w-5 h-5">${iconDef.svg}</div>
            </div>
            <div class="flex-1 min-w-0 space-y-1">
              <input type="text" class="scan-item-name form-input w-full text-xs py-1.5 px-2 font-medium" data-index="${index}" value="${escapeHtml(item.name)}" placeholder="Nombre limpio del producto">
              <div class="grid grid-cols-3 gap-1 text-[10px]">
                <input type="text" class="scan-item-qty form-input text-[10px] py-0.5 px-1.5 text-amber-300 font-semibold" data-index="${index}" value="${escapeHtml(item.quantity && item.quantity !== '1' && item.quantity !== '1.0' ? item.quantity : '')}" placeholder="⚡ Cant: 2x">
                <input type="text" class="scan-item-weight form-input text-[10px] py-0.5 px-1.5 text-slate-300" data-index="${index}" value="${escapeHtml(item.weight || '')}" placeholder="⚖️ Peso: 400g">
                <input type="text" class="scan-item-volume form-input text-[10px] py-0.5 px-1.5 text-slate-300" data-index="${index}" value="${escapeHtml(item.volume || '')}" placeholder="🧴 Vol: 1.5L">
              </div>
            </div>
          </div>
          <div class="flex items-center justify-between sm:justify-end gap-2 pl-6 sm:pl-0 flex-shrink-0">
            <div class="flex items-center gap-1.5">
              <span class="scan-curr-symbol text-xs font-semibold text-slate-400">${currSymbol}</span>
              <input type="number" step="0.01" min="0" class="scan-item-price form-input w-24 text-xs py-1.5 px-2 text-right font-bold text-slate-100" data-index="${index}" value="${(parseFloat(item.price) || 0).toFixed(2)}">
            </div>
            <div class="flex items-center gap-1.5">
              ${statusBadgeHtml}
              <button type="button" class="scan-item-delete text-slate-500 hover:text-red-400 p-1.5 transition rounded-lg hover:bg-slate-800" data-index="${index}" title="Quitar de la lista">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Listeners de checkboxes individuales
    container.querySelectorAll('.scan-item-chk').forEach(chk => {
      chk.addEventListener('change', (e) => {
        const idx = parseInt(e.target.dataset.index, 10);
        if (scannedItems[idx]) {
          scannedItems[idx].selected = e.target.checked;
          updateScanTotals();
        }
      });
    });

    // Listeners de edición de nombre
    container.querySelectorAll('.scan-item-name').forEach(inp => {
      inp.addEventListener('input', (e) => {
        const idx = parseInt(e.target.dataset.index, 10);
        if (scannedItems[idx]) {
          scannedItems[idx].name = e.target.value;
          // Actualizar icono automáticamente según nuevo nombre
          const newIcon = window.aiScanner.guessProductIcon(e.target.value);
          if (newIcon !== scannedItems[idx].icon) {
            scannedItems[idx].icon = newIcon;
            const iconDef = (window.AppIcons && window.AppIcons.products && window.AppIcons.products[newIcon]) || {
              color: '#94a3b8',
              bg: 'rgba(148, 163, 184, 0.15)',
              name: 'General',
              svg: ''
            };
            const iconBox = document.getElementById(`scan-icon-box-${idx}`);
            if (iconBox) {
              iconBox.style.background = iconDef.bg;
              iconBox.style.color = iconDef.color;
              iconBox.title = `Categoría: ${iconDef.name}`;
              iconBox.innerHTML = `<div class="w-5 h-5">${iconDef.svg}</div>`;
            }
          }
        }
      });
      inp.addEventListener('blur', () => {
        refreshItemsStoreStatus();
      });
    });

    // Listeners de edición de precio
    container.querySelectorAll('.scan-item-price').forEach(inp => {
      inp.addEventListener('input', (e) => {
        const idx = parseInt(e.target.dataset.index, 10);
        if (scannedItems[idx]) {
          scannedItems[idx].price = parseFloat(e.target.value) || 0;
          updateScanTotals();
        }
      });
    });

    // Listeners de edición de cantidad (combo/pack)
    container.querySelectorAll('.scan-item-qty').forEach(inp => {
      inp.addEventListener('input', (e) => {
        const idx = parseInt(e.target.dataset.index, 10);
        if (scannedItems[idx]) {
          scannedItems[idx].quantity = e.target.value.trim() || null;
        }
      });
    });

    // Listeners de edición de peso
    container.querySelectorAll('.scan-item-weight').forEach(inp => {
      inp.addEventListener('input', (e) => {
        const idx = parseInt(e.target.dataset.index, 10);
        if (scannedItems[idx]) {
          scannedItems[idx].weight = e.target.value.trim() || null;
        }
      });
    });

    // Listeners de edición de volumen
    container.querySelectorAll('.scan-item-volume').forEach(inp => {
      inp.addEventListener('input', (e) => {
        const idx = parseInt(e.target.dataset.index, 10);
        if (scannedItems[idx]) {
          scannedItems[idx].volume = e.target.value.trim() || null;
        }
      });
    });

    // Listeners para eliminar producto
    container.querySelectorAll('.scan-item-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const btnTarget = e.target.closest('.scan-item-delete');
        const idx = parseInt(btnTarget.dataset.index, 10);
        scannedItems.splice(idx, 1);
        renderScannedItemsList();
      });
    });

    updateScanTotals();
  }

  // Checkbox de Seleccionar Todos
  const scanSelectAllChk = document.getElementById('scanSelectAllChk');
  if (scanSelectAllChk) {
    scanSelectAllChk.addEventListener('change', (e) => {
      const isChecked = e.target.checked;
      scannedItems.forEach(item => {
        item.selected = isChecked;
      });
      document.querySelectorAll('.scan-item-chk').forEach(chk => {
        chk.checked = isChecked;
      });
      updateScanTotals();
    });
  }

  // Botón Añadir Producto Manual a la lista escaneada
  const btnScanAddNewRow = document.getElementById('btnScanAddNewRow');
  if (btnScanAddNewRow) {
    btnScanAddNewRow.addEventListener('click', () => {
      scannedItems.push({
        name: 'Producto ' + (scannedItems.length + 1),
        price: 0.0,
        quantity: null,
        weight: null,
        volume: null,
        invoiceQty: 1.0,
        selected: true,
        icon: 'general',
        isExisting: false
      });
      renderScannedItemsList();
      const nameInputs = document.querySelectorAll('.scan-item-name');
      if (nameInputs.length > 0) {
        const lastInput = nameInputs[nameInputs.length - 1];
        lastInput.focus();
        lastInput.select();
      }
    });
  }

  // Cambio de selector de tienda
  const scanStoreSelector = document.getElementById('scanStoreSelector');
  const scanNewStoreInput = document.getElementById('scanNewStoreInput');
  if (scanStoreSelector) {
    scanStoreSelector.addEventListener('change', () => {
      if (scanStoreSelector.value === 'CUSTOM_NEW') {
        scanNewStoreInput.classList.remove('hidden');
        scanNewStoreInput.focus();
      } else {
        scanNewStoreInput.classList.add('hidden');
      }
      refreshItemsStoreStatus();
    });
  }

  // Cambio de selector de moneda
  const scanCurrencySelector = document.getElementById('scanCurrencySelector');
  if (scanCurrencySelector) {
    scanCurrencySelector.addEventListener('change', () => {
      updateScanTotals();
    });
  }

  // Procesar con IA
  document.getElementById('btnProcessAI').addEventListener('click', async () => {
    if (!activeCompressedPhoto) {
      showToast('Primero toma o sube una foto', 'error');
      return;
    }

    const apiKey = await window.aiScanner.getApiKey();
    if (!apiKey) {
      await updateApiKeyUI();
      await updateModelTierUI();
      openModal('modalGeminiApiKey');
      showToast('Configura tu clave de Google Gemini para iniciar el escaneo con IA', 'info');
      return;
    }

    const processBtn = document.getElementById('btnProcessAI');
    processBtn.disabled = true;
    const isPro = activeModelTier === 'pro';
    processBtn.innerHTML = isPro
      ? '⭐ Extrayendo productos con Gemini Pro...'
      : '⏳ Extrayendo productos con Gemini Flash...';

    try {
      const result = await window.aiScanner.analyzeImage(activeCompressedPhoto.dataUrl, activeScanMode);
      activeExtractionData = result;

      // 1. Cargar y configurar Tiendas de Destino
      const stores = await window.db.getStores();
      const detectedStoreName = (result.store_name || '').trim() || 'Comercio Detectado';
      const matchedStore = stores.find(s => s.name.trim().toLowerCase() === detectedStoreName.toLowerCase());

      const storeSelector = document.getElementById('scanStoreSelector');
      storeSelector.innerHTML = '';

      if (matchedStore) {
        const optMatch = document.createElement('option');
        optMatch.value = matchedStore.id;
        optMatch.textContent = `🏪 ${matchedStore.name} (Detectada en catálogo)`;
        storeSelector.appendChild(optMatch);
      } else {
        const optNew = document.createElement('option');
        optNew.value = 'NEW_DETECTED';
        optNew.textContent = `✨ Crear nueva: "${detectedStoreName}"`;
        storeSelector.appendChild(optNew);
      }

      // Otras tiendas existentes
      stores.filter(s => !matchedStore || s.id !== matchedStore.id).forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = `🏪 ${s.name}`;
        storeSelector.appendChild(opt);
      });

      // Opción de crear otra tienda personalizada
      const optCustom = document.createElement('option');
      optCustom.value = 'CUSTOM_NEW';
      optCustom.textContent = '+ Crear otra tienda con otro nombre...';
      storeSelector.appendChild(optCustom);

      document.getElementById('scanNewStoreInput').classList.add('hidden');
      document.getElementById('scanNewStoreInput').value = '';

      // 2. Moneda detectada
      const currSelector = document.getElementById('scanCurrencySelector');
      currSelector.value = (result.currency || 'USD').toUpperCase() === 'VES' ? 'VES' : 'USD';

      // 3. Toggle de registro de gasto contable
      const expenseToggle = document.getElementById('scanRecordExpenseToggle');
      if (expenseToggle) {
        // En facturas de compra viene marcado por defecto; en menús/listas viene desmarcado
        expenseToggle.checked = (activeScanMode === 'FACTURA');
      }

      // 4. Mapear ítems detectados
      const rawItems = Array.isArray(result.items) ? result.items : [];
      scannedItems = rawItems.map(item => {
        const rawName = (item.name || '').trim();
        const rawWeight = (item.weight || '').trim();
        const rawVolume = (item.volume || '').trim();
        const rawQty = (item.quantity !== undefined && item.quantity !== null) ? String(item.quantity).trim() : '';

        const sanitized = window.ProductUtils
          ? window.ProductUtils.sanitizeProductAttributes(rawName, rawWeight, rawVolume, rawQty)
          : { name: rawName, weight: rawWeight || null, volume: rawVolume || null, quantity: rawQty || null };

        const cleanName = sanitized.name;
        return {
          name: cleanName,
          weight: sanitized.weight,
          volume: sanitized.volume,
          quantity: sanitized.quantity,
          invoiceQty: parseFloat(item.quantity) || 1,
          price: parseFloat(item.price) || 0,
          selected: true,
          icon: window.aiScanner.guessProductIcon(cleanName, item.category_hint),
          category_hint: item.category_hint || '',
          isExisting: false
        };
      }).filter(item => item.name.length > 0);

      // Renderizar tabla editable
      renderScannedItemsList();
      await refreshItemsStoreStatus();

      document.getElementById('scanResultBox').classList.remove('hidden');
      showToast(`¡Se detectaron ${scannedItems.length} productos! Revisa y confirma el registro múltiple.`, 'success');
    } catch (err) {
      console.error(err);
      showToast('Error al analizar con IA: ' + err.message, 'error');
    } finally {
      processBtn.disabled = false;
      setScanMode(activeScanMode);
    }
  });

  // Confirmar y Guardar Registro Múltiple en BD
  document.getElementById('btnConfirmScan').addEventListener('click', async () => {
    if (!activeExtractionData) return;
    if (!window.authGroups.hasPermission('can_manage_catalog')) {
      showToast('⚠️ No tienes permiso para agregar productos en este grupo.', 'error');
      return;
    }

    const selectedProducts = scannedItems.filter(item => item.selected && item.name.trim().length > 0);
    if (selectedProducts.length === 0) {
      showToast('Selecciona al menos un producto válido para registrar', 'error');
      return;
    }

    const storeSelector = document.getElementById('scanStoreSelector');
    const currencySelector = document.getElementById('scanCurrencySelector');
    const expenseToggle = document.getElementById('scanRecordExpenseToggle');
    const newStoreInput = document.getElementById('scanNewStoreInput');

    let chosenStoreId = storeSelector.value;
    let chosenStoreName = null;

    if (chosenStoreId === 'CUSTOM_NEW') {
      chosenStoreName = newStoreInput.value.trim();
      if (!chosenStoreName) {
        showToast('Escribe el nombre de la nueva tienda', 'error');
        newStoreInput.focus();
        return;
      }
      chosenStoreId = null;
    } else if (chosenStoreId === 'NEW_DETECTED') {
      chosenStoreName = (activeExtractionData.store_name || '').trim() || 'Comercio Detectado';
      chosenStoreId = null;
    }

    const confirmBtn = document.getElementById('btnConfirmScan');
    confirmBtn.disabled = true;
    confirmBtn.innerHTML = '⏳ Guardando productos...';

    try {
      const commitRes = await window.aiScanner.processAndCommitExtraction(activeExtractionData, {
        compressedPhoto: activeCompressedPhoto,
        storeId: chosenStoreId,
        storeName: chosenStoreName,
        currency: currencySelector.value,
        recordExpense: expenseToggle ? expenseToggle.checked : false,
        items: selectedProducts
      });

      showToast(
        `¡Éxito! ${commitRes.totalItemsProcessed} productos guardados en ${commitRes.store.name} (${commitRes.newProductsCount} nuevos, ${commitRes.updatedProductsCount} actualizados)`,
        'success'
      );

      // Notificación al grupo sobre escaneo múltiple con IA
      const activeWs = window.authGroups.getActiveWorkspace();
      if (activeWs && activeWs.type === 'GROUP' && window.db.addNotification) {
        try {
          const user = window.authGroups.getCurrentUser();
          const uName = user ? (user.displayName || user.email) : 'Un miembro';
          await window.db.addNotification({
            recipient_email: 'ALL_GROUP_MEMBERS',
            sender_email: user ? user.email : null,
            sender_name: uName,
            group_id: activeWs.id,
            group_name: activeWs.name,
            type: 'CATALOG',
            title: `📸 Productos escaneados en "${activeWs.name}"`,
            message: `${uName} guardó ${commitRes.totalItemsProcessed} productos escaneados con IA en la tienda "${commitRes.store.name}".`,
            data: { groupId: activeWs.id, storeName: commitRes.store.name }
          });
          if (typeof updateNotificationBadge === 'function') updateNotificationBadge();
        } catch (errNotif) {
          console.warn('Error al registrar notificación de escaneo:', errNotif);
        }
      }

      // Limpiar estado del escáner
      activeExtractionData = null;
      activeCompressedPhoto = null;
      scannedItems = [];
      document.getElementById('scanPreviewCard').classList.add('hidden');
      document.getElementById('scanResultBox').classList.add('hidden');
      document.getElementById('cameraFileInput').value = '';
      document.getElementById('galleryFileInput').value = '';

      // Redirigir a vista de productos
      switchView('products');
    } catch (err) {
      console.error(err);
      showToast('Error al registrar en la base de datos: ' + err.message, 'error');
    } finally {
      confirmBtn.disabled = false;
      updateScanTotals();
    }
  });

  document.getElementById('btnDiscardScan').addEventListener('click', () => {
    activeExtractionData = null;
    scannedItems = [];
    document.getElementById('scanResultBox').classList.add('hidden');
    showToast('Escaneo descartado', 'info');
  });

  // ----------------------------------------------------
  // 4. PROGRAMAR MERCADO (CANASTA CON + Y -)
  // ----------------------------------------------------
  const plannerCart = new Map(); // productName -> quantity

  async function loadPlannerProductList() {
    const catalogContainer = document.getElementById('plannerCatalogList');
    if (!catalogContainer) return;

    const searchFilter = (document.getElementById('plannerSearchInput').value || '').toLowerCase().trim();
    const products = await window.db.getProducts();

    // Group products by unique trimmed name to get a representative item
    const productsByName = new Map();
    products.forEach(p => {
      const trimmed = p.name.trim();
      if (!productsByName.has(trimmed)) {
        productsByName.set(trimmed, p);
      }
    });

    const uniqueNames = Array.from(productsByName.keys()).sort();
    const filtered = uniqueNames.filter(name => name.toLowerCase().includes(searchFilter));

    const totalEl = document.getElementById('plannerCatalogTotal');
    if (totalEl) totalEl.textContent = `${filtered.length} productos`;

    if (filtered.length === 0) {
      catalogContainer.innerHTML = `
        <div class="text-center py-8 text-slate-500">
          <p class="text-2xl mb-1">🔍</p>
          <p class="text-xs">No se encontraron productos en el catálogo</p>
        </div>
      `;
    } else {
      const currentRate = (window.bcvService && window.bcvService.rate > 0) ? window.bcvService.rate : 45.0;
      catalogContainer.innerHTML = filtered.map(name => {
        const prod = productsByName.get(name);
        const mediaHtml = window.AppIcons ? window.AppIcons.renderProductMedia(prod, 'w-8 h-8') : '🏷️';
        const inCartQty = plannerCart.get(name) || 0;
        let priceUsd = prod ? parseFloat(prod.current_price) : 0;
        if (prod && prod.original_currency === 'VES') {
          priceUsd = currentRate > 0 ? priceUsd / currentRate : 0;
        }
        const priceInfo = prod ? formatDisplayPrice(priceUsd) : null;
        const titleHtml = window.ProductUtils ? window.ProductUtils.formatTitleWithQuantity(prod || { name }) : escapeHtml(name);
        const specsHtml = window.ProductUtils ? window.ProductUtils.formatSpecsBadge(prod || {}) : '';

        return `
          <div class="flex items-center justify-between p-2 rounded-xl bg-slate-800/40 hover:bg-slate-800 border border-slate-800/60 transition gap-2 min-w-0 w-full">
            <div class="flex items-center gap-2.5 min-w-0 flex-1">
              ${mediaHtml}
              <div class="min-w-0 flex-1 truncate">
                <span class="text-xs font-semibold text-slate-200 truncate flex items-center">${titleHtml}</span>
                <div class="flex items-center gap-1.5 text-[10px]">
                  ${priceInfo ? `<span class="text-slate-300 font-bold">${priceInfo.primary}</span>` : ''}
                  ${specsHtml ? `<span>•</span> ${specsHtml}` : ''}
                  ${inCartQty > 0 ? `<span class="text-emerald-400 font-bold">• ${inCartQty} en canasta</span>` : '<span class="text-slate-500">• Disponible</span>'}
                </div>
              </div>
            </div>
            <button class="btn-planner-add-item w-8 h-8 rounded-full bg-emerald-500/20 hover:bg-emerald-500 text-emerald-400 hover:text-white font-bold flex items-center justify-center flex-shrink-0 transition shadow" data-name="${escapeHtml(name)}" title="Agregar 1 unidad a la canasta">
              <svg class="w-4 h-4 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4"/></svg>
            </button>
          </div>
        `;
      }).join('');
    }

    // Attach listeners on catalog add buttons
    catalogContainer.querySelectorAll('.btn-planner-add-item').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!window.authGroups.hasPermission('can_manage_cart')) {
          showToast('⚠️ No tienes permiso para agregar productos al carro de compras en este grupo.', 'error');
          return;
        }
        const name = btn.dataset.name;
        const current = plannerCart.get(name) || 0;
        plannerCart.set(name, current + 1);
        renderPlannerCart();
        loadPlannerProductList(); // refresh counts
        showToast(`+1 "${name}" en la canasta`, 'info');
      });
    });

    renderPlannerCart();
  }

  async function renderPlannerCart() {
    const cartContainer = document.getElementById('plannerCartList');
    const summaryEl = document.getElementById('plannerCartSummary');
    const clearBtn = document.getElementById('btnClearPlannerCart');
    const notifyBtn = document.getElementById('btnNotifyGroupCart');
    const activeWs = window.authGroups.getActiveWorkspace();
    const isGroup = activeWs && activeWs.type === 'GROUP';
    if (!cartContainer) return;

    const products = await window.db.getProducts();
    const productsByName = new Map();
    products.forEach(p => {
      const trimmed = p.name.trim();
      if (!productsByName.has(trimmed)) productsByName.set(trimmed, p);
    });

    if (plannerCart.size === 0) {
      cartContainer.innerHTML = `
        <div class="text-center py-10 text-slate-500">
          <p class="text-3xl mb-2">🛒</p>
          <p class="font-semibold text-slate-300 text-xs">Tu canasta está vacía</p>
          <p class="text-[11px] text-slate-500 mt-1 max-w-[220px] mx-auto">Toca el botón <span class="text-emerald-400 font-bold">+</span> en cualquier producto del catálogo para agregarlo.</p>
        </div>
      `;
      if (summaryEl) summaryEl.textContent = '0 unidades (0 productos)';
      if (clearBtn) clearBtn.classList.add('hidden');
      if (notifyBtn) notifyBtn.classList.add('hidden');
      return;
    }

    if (clearBtn) clearBtn.classList.remove('hidden');
    if (notifyBtn) {
      notifyBtn.classList.toggle('hidden', !isGroup);
    }

    let totalUnits = 0;
    let totalUsdCost = 0;
    const currentRate = (window.bcvService && window.bcvService.rate > 0) ? window.bcvService.rate : 45.0;

    plannerCart.forEach((qty, name) => {
      totalUnits += qty;
      const prod = productsByName.get(name);
      if (prod && prod.current_price) {
        let pUsd = parseFloat(prod.current_price) || 0;
        if (prod.original_currency === 'VES') pUsd = currentRate > 0 ? pUsd / currentRate : 0;
        totalUsdCost += (pUsd * qty);
      }
    });

    const totalCostFormatted = formatDisplayPrice(totalUsdCost);

    if (summaryEl) {
      summaryEl.innerHTML = `
        <span>${totalUnits} und (${plannerCart.size} prod)</span>
        <span class="text-emerald-400 font-extrabold ml-1.5">${totalCostFormatted.primary}</span>
      `;
    }

    const cartEntries = Array.from(plannerCart.entries());
    cartContainer.innerHTML = cartEntries.map(([name, qty]) => {
      const prod = productsByName.get(name) || { name };
      let itemUsd = parseFloat(prod.current_price) || 0;
      if (prod.original_currency === 'VES') itemUsd = currentRate > 0 ? itemUsd / currentRate : 0;
      const subtotalFormatted = formatDisplayPrice(itemUsd * qty);
      const mediaHtml = window.AppIcons ? window.AppIcons.renderProductMedia(prod, 'w-8 h-8') : '🛒';
      const titleHtml = window.ProductUtils ? window.ProductUtils.formatTitleWithQuantity(prod) : escapeHtml(name);
      const specsHtml = window.ProductUtils ? window.ProductUtils.formatSpecsBadge(prod) : '';

      return `
        <div class="flex items-center justify-between p-2 rounded-xl bg-slate-800/80 border border-slate-700/70 gap-2">
          <div class="flex items-center gap-2.5 min-w-0">
            ${mediaHtml}
            <div class="truncate">
              <span class="text-xs font-bold text-slate-100 block truncate flex items-center">${titleHtml}</span>
              <div class="flex items-center gap-1.5 text-[10px] text-slate-400 font-semibold">
                <span>${subtotalFormatted.primary}</span>
                ${specsHtml ? `<span>•</span> ${specsHtml}` : ''}
              </div>
            </div>
          </div>

          <div class="flex items-center gap-1.5 flex-shrink-0">
            <!-- Botón - para restar 1 (si llega a 0 se elimina) -->
            <button class="btn-cart-minus w-7 h-7 rounded-lg bg-slate-700 hover:bg-red-500/30 text-slate-200 hover:text-red-400 font-black flex items-center justify-center transition" data-name="${escapeHtml(name)}" title="Restar 1 unidad">
              <svg class="w-3.5 h-3.5 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M20 12H4"/></svg>
            </button>

            <!-- Contador de unidades -->
            <span class="px-2 py-0.5 rounded-md bg-slate-900 border border-slate-700 text-xs font-black text-blue-400 min-w-[28px] text-center">
              x${qty}
            </span>

            <!-- Botón + para sumar 1 -->
            <button class="btn-cart-plus w-7 h-7 rounded-lg bg-slate-700 hover:bg-emerald-500/30 text-slate-200 hover:text-emerald-400 font-black flex items-center justify-center transition" data-name="${escapeHtml(name)}" title="Añadir 1 unidad más">
              <svg class="w-3.5 h-3.5 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4"/></svg>
            </button>
          </div>
        </div>
      `;
    }).join('');

    // Attach listeners on cart buttons
    cartContainer.querySelectorAll('.btn-cart-plus').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!window.authGroups.hasPermission('can_manage_cart')) {
          showToast('⚠️ No tienes permiso para modificar el carro de compras en este grupo.', 'error');
          return;
        }
        const name = btn.dataset.name;
        const current = plannerCart.get(name) || 0;
        plannerCart.set(name, current + 1);
        renderPlannerCart();
        loadPlannerProductList();
      });
    });

    cartContainer.querySelectorAll('.btn-cart-minus').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!window.authGroups.hasPermission('can_manage_cart')) {
          showToast('⚠️ No tienes permiso para modificar el carro de compras en este grupo.', 'error');
          return;
        }
        const name = btn.dataset.name;
        const current = plannerCart.get(name) || 0;
        if (current <= 1) {
          plannerCart.delete(name);
          showToast(`"${name}" quitado de la canasta`, 'info');
        } else {
          plannerCart.set(name, current - 1);
        }
        renderPlannerCart();
        loadPlannerProductList();
      });
    });
  }

  function renderPlannerOptimizationCards(plan, totalCount = null) {
    if (!plan) return;
    lastPlannerPlan = plan;
    const totalSelectedCount = totalCount || plan.totalRequested || (plan.bestCheapest ? plan.bestCheapest.available.length : 0);
    const isVes = (activeDisplayCurrency === 'VES');

    // 1. Tarjeta La Más Barata
    const cardCheapest = document.getElementById('cardBestCheapest');
    if (plan.bestCheapest) {
      cardCheapest.querySelector('.store-name').textContent = plan.bestCheapest.store.name;
      cardCheapest.querySelector('.store-summary').textContent = `${plan.bestCheapest.available.length}/${totalSelectedCount} productos disponibles`;
      cardCheapest.querySelector('.store-price').textContent = isVes
        ? `Bs. ${plan.bestCheapest.totalCostVES.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : `$ ${plan.bestCheapest.totalCostUSD.toFixed(2)}`;
    } else {
      cardCheapest.querySelector('.store-name').textContent = 'No disponible';
    }

    // 2. Tarjeta La Más Cercana
    const cardClosest = document.getElementById('cardBestClosest');
    if (plan.bestClosest) {
      cardClosest.querySelector('.store-name').textContent = plan.bestClosest.store.name;
      cardClosest.querySelector('.store-summary').textContent = `${plan.bestClosest.available.length}/${totalSelectedCount} productos`;
      cardClosest.querySelector('.store-distance').textContent = plan.bestClosest.distanceKm ? `${plan.bestClosest.distanceKm.toFixed(1)} km` : 'Ver en mapa';
    } else {
      cardClosest.querySelector('.store-name').textContent = 'Ubicación requerida';
      cardClosest.querySelector('.store-distance').textContent = '📍 Desactivada';
    }

    // 3. Tarjeta Mejor Valorada
    const cardRated = document.getElementById('cardBestRated');
    if (plan.bestRated && plan.bestRated.avgRating) {
      cardRated.querySelector('.store-name').textContent = plan.bestRated.store.name;
      cardRated.querySelector('.store-summary').textContent = `Promedio de calidad personal`;
      cardRated.querySelector('.store-rating').textContent = `⭐ ${plan.bestRated.avgRating.toFixed(1)} / 5`;
    } else {
      cardRated.querySelector('.store-name').textContent = 'Sin calificaciones';
      cardRated.querySelector('.store-rating').textContent = '⭐ --';
    }

    // Lista comparativa detallada
    const listContainer = document.getElementById('plannerResultsList');
    listContainer.innerHTML = plan.recommendations.map(r => {
      const missingTags = r.missing.map(m => `
        <span class="text-[10px] bg-red-500/10 text-red-400 border border-red-500/20 px-1.5 py-0.5 rounded">Falta: ${escapeHtml(m.name || m)}</span>
      `).join(' ');

      const availableItemsSummary = r.available.map(a => {
        const itemCost = isVes
          ? `Bs. ${((a.totalPriceVES || 0)).toFixed(2)}`
          : `$ ${((a.totalPriceUSD || 0)).toFixed(2)}`;
        const pName = a.matchedProduct ? a.matchedProduct.name : (a.product ? a.product.name : a.requestedName);
        return `
          <span class="text-[10px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded border border-slate-700">
            ${escapeHtml(pName)} (x${a.quantity || a.qty || 1}): ${itemCost}
          </span>
        `;
      }).join(' ');

      const mainCost = isVes
        ? `Bs. ${r.totalCostVES.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : `$ ${r.totalCostUSD.toFixed(2)}`;
      const subCost = isVes
        ? `$ ${r.totalCostUSD.toFixed(2)} USD`
        : `Bs. ${r.totalCostVES.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

      return `
        <div class="p-3 bg-slate-800/60 border border-slate-700/60 rounded-xl flex flex-col gap-2 text-xs">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <div class="flex items-center gap-2">
                <span class="font-bold text-slate-100 text-sm">${escapeHtml(r.store.name)}</span>
                <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${r.coveragePercent === 100 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}">
                  ${r.available.length}/${totalSelectedCount} encontrados (${r.coveragePercent}%)
                </span>
              </div>
            </div>

            <div class="flex items-center gap-4 text-right">
              <div>
                <span class="text-sm font-extrabold text-emerald-400 block">${mainCost}</span>
                <span class="text-[10px] text-slate-400">${subCost}</span>
              </div>
              <a href="${r.store.maps_url || '#'}" target="_blank" class="btn btn-secondary btn-sm">
                📍 Ir
              </a>
            </div>
          </div>

          <div class="flex flex-wrap gap-1 pt-1 border-t border-slate-800/60">
            ${availableItemsSummary}
          </div>
          ${r.missing.length > 0 ? `<div class="flex flex-wrap gap-1">${missingTags}</div>` : ''}
        </div>
      `;
    }).join('');
  }

  document.getElementById('btnClearPlannerCart').addEventListener('click', () => {
    if (!window.authGroups.hasPermission('can_manage_cart')) {
      showToast('⚠️ No tienes permiso para vaciar el carro de compras en este grupo.', 'error');
      return;
    }
    plannerCart.clear();
    renderPlannerCart();
    loadPlannerProductList();
    showToast('Canasta vaciada', 'info');
  });

  // Notificación manual al grupo sobre el carro de compras
  const btnNotifyCart = document.getElementById('btnNotifyGroupCart');
  if (btnNotifyCart) {
    btnNotifyCart.addEventListener('click', async () => {
      const activeWs = window.authGroups.getActiveWorkspace();
      if (activeWs.type !== 'GROUP') {
        showToast('⚠️ Cambia a un espacio de grupo familiar para notificar a sus miembros.', 'info');
        return;
      }
      if (plannerCart.size === 0) {
        showToast('⚠️ Tu canasta está vacía. Añade al menos un producto antes de avisar.', 'error');
        return;
      }

      let totalUnits = 0;
      plannerCart.forEach(q => totalUnits += q);
      const itemsCount = plannerCart.size;

      const ok = confirm(`¿Deseas enviar una notificación a todos los miembros de "${activeWs.name}" avisando sobre la canasta actual (${totalUnits} unidades de ${itemsCount} productos)?`);
      if (!ok) return;

      const user = window.authGroups.getCurrentUser();
      const uName = user ? (user.displayName || user.email) : 'Un miembro';

      try {
        await window.db.addNotification({
          recipient_email: 'ALL_GROUP_MEMBERS',
          sender_email: user ? user.email : null,
          sender_name: uName,
          group_id: activeWs.id,
          group_name: activeWs.name,
          type: 'CART',
          title: `🛒 Carro de compras actualizado en "${activeWs.name}"`,
          message: `${uName} preparó y actualizó la canasta con ${totalUnits} unidades de ${itemsCount} productos. ¡Ya pueden revisarla u optimizarla en el planificador!`,
          data: { groupId: activeWs.id, totalUnits, itemsCount }
        });

        showToast('📢 ¡Aviso sobre el carro enviado a los miembros del grupo!', 'success');
        if (typeof updateNotificationBadge === 'function') updateNotificationBadge();
      } catch (err) {
        showToast('Error al enviar notificación: ' + err.message, 'error');
      }
    });
  }

  document.getElementById('plannerSearchInput').addEventListener('input', loadPlannerProductList);

  document.getElementById('btnExecutePlanner').addEventListener('click', async () => {
    if (plannerCart.size === 0) {
      showToast('Añade al menos un producto a tu canasta usando el botón +', 'error');
      return;
    }

    const items = Array.from(plannerCart.entries()).map(([name, qty]) => ({ name, qty }));
    const totalSelectedCount = items.length;

    showToast('Optimizando compra con las cantidades elegidas...', 'info');
    const plan = await window.groceryPlanner.planMarket(items);
    renderPlannerOptimizationCards(plan, totalSelectedCount);
  });

  // ----------------------------------------------------
  // 5. CONTABILIDAD (EXPENSES)
  // ----------------------------------------------------
  let currentExpensePeriod = 'MONTH';

  async function renderAccounting() {
    const summary = await window.accountingService.getSummary(currentExpensePeriod);

    document.getElementById('statTotalUSD').textContent = `$ ${summary.totalUSD.toFixed(2)}`;
    document.getElementById('statTotalVES').textContent = `Bs. ${summary.totalVES.toFixed(2)}`;
    document.getElementById('statSubUSD').textContent = `${summary.count} transacciones`;
    document.getElementById('statFacturasCount').textContent = `🧾 ${summary.invoiceExpensesCount} Facturas`;
    document.getElementById('statManualesCount').textContent = `✍️ ${summary.manualExpensesCount} Manuales`;

    const list = document.getElementById('expensesList');
    if (summary.expenses.length === 0) {
      list.innerHTML = `<p class="text-xs text-slate-500 py-6 text-center">No hay gastos registrados en este período.</p>`;
      return;
    }

    list.innerHTML = summary.expenses.map(exp => {
      const isInvoice = exp.source === 'FACTURA';
      return `
        <div class="flex items-center justify-between p-3 rounded-xl bg-slate-800/40 border border-slate-800 text-xs hover:border-slate-700 transition gap-2">
          <div class="flex items-center gap-3 flex-1 min-w-0 pr-2">
            <span class="w-8 h-8 rounded-lg flex items-center justify-center ${isInvoice ? 'bg-blue-500/10 text-blue-400' : 'bg-emerald-500/10 text-emerald-400'} font-bold flex-shrink-0">
              ${isInvoice ? '🧾' : '✍️'}
            </span>
            <div class="min-w-0 flex-1">
              <span class="font-bold text-slate-100 block truncate" title="${escapeHtml(exp.concept)}">${escapeHtml(exp.concept)}</span>
              <span class="text-[11px] text-slate-400">${exp.date} • <span class="text-slate-300 font-semibold">${escapeHtml(exp.category || 'Otros')}</span>${exp.note ? ' • ' + escapeHtml(exp.note) : ''}</span>
            </div>
          </div>
          <div class="flex items-center gap-2.5 flex-shrink-0">
            <div class="text-right">
              <span class="text-sm font-bold text-slate-100 block">$ ${parseFloat(exp.amount_usd || 0).toFixed(2)}</span>
              <span class="text-[10px] text-emerald-400 font-medium">Bs. ${parseFloat(exp.amount_ves || 0).toFixed(2)}</span>
            </div>
            <div class="flex items-center gap-1 border-l border-slate-700/60 pl-2">
              <button type="button" class="btn-edit-expense p-1.5 rounded-lg text-slate-400 hover:text-blue-400 hover:bg-slate-700/60 transition" data-id="${exp.id}" title="Editar gasto">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
              </button>
              <button type="button" class="btn-delete-expense p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-slate-700/60 transition" data-id="${exp.id}" title="Eliminar gasto">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Listeners para editar gastos
    list.querySelectorAll('.btn-edit-expense').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = parseInt(btn.dataset.id, 10);
        const exp = await window.db.getById('expenses', id);
        if (!exp) return;

        document.getElementById('inputExpenseId').value = exp.id;
        const modalTitle = document.getElementById('modalExpenseTitle');
        if (modalTitle) modalTitle.textContent = 'Editar Gasto';
        document.getElementById('inputExpenseConcept').value = exp.concept || '';

        const curr = exp.original_currency || 'USD';
        document.getElementById('inputExpenseCurrency').value = curr;
        const amt = (curr === 'VES' ? exp.amount_ves : exp.amount_usd) || 0;
        document.getElementById('inputExpenseAmount').value = parseFloat(amt).toFixed(2);

        document.getElementById('inputExpenseCategory').value = exp.category || 'Otros';
        document.getElementById('inputExpenseDate').value = exp.date || new Date().toISOString().split('T')[0];
        document.getElementById('inputExpenseNote').value = exp.note || '';

        openModal('modalExpense');
      });
    });

    // Listeners para eliminar gastos
    list.querySelectorAll('.btn-delete-expense').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = parseInt(btn.dataset.id, 10);
        const exp = await window.db.getById('expenses', id);
        if (!exp) return;

        const concept = exp.concept || 'este gasto';
        if (confirm(`¿Eliminar el gasto "${concept}"? Esta acción no se puede deshacer.`)) {
          await window.accountingService.deleteExpense(id);
          showToast('Gasto eliminado correctamente', 'info');
          renderAccounting();
        }
      });
    });
  }

  document.querySelectorAll('[data-period]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-period]').forEach(b => b.classList.remove('btn-primary', 'active-period'));
      btn.classList.add('btn-primary', 'active-period');
      currentExpensePeriod = btn.dataset.period;
      renderAccounting();
    });
  });

  document.getElementById('btnNewManualExpense').addEventListener('click', () => {
    document.getElementById('formExpense').reset();
    document.getElementById('inputExpenseId').value = '';
    const modalTitle = document.getElementById('modalExpenseTitle');
    if (modalTitle) modalTitle.textContent = 'Nuevo Gasto Manual';
    document.getElementById('inputExpenseDate').value = new Date().toISOString().split('T')[0];
    openModal('modalExpense');
  });

  document.getElementById('formExpense').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('inputExpenseId').value;
    const concept = document.getElementById('inputExpenseConcept').value.trim();
    const amount = parseFloat(document.getElementById('inputExpenseAmount').value);
    const currency = document.getElementById('inputExpenseCurrency').value;
    const category = document.getElementById('inputExpenseCategory').value;
    const date = document.getElementById('inputExpenseDate').value;
    const note = document.getElementById('inputExpenseNote').value.trim();

    try {
      if (id) {
        await window.accountingService.updateExpense(id, {
          concept,
          amount,
          currency,
          category,
          date,
          note
        });
        showToast('Gasto actualizado con éxito', 'success');
      } else {
        await window.accountingService.addManualExpense({
          concept,
          amount,
          currency,
          category,
          date,
          note
        });
        showToast('Gasto manual registrado con éxito', 'success');
      }
      closeModal('modalExpense');
      renderAccounting();
    } catch (err) {
      console.error(err);
      showToast('Error al guardar el gasto: ' + err.message, 'error');
    }
  });

  // ----------------------------------------------------
  // 6. ARCHIVO DE FACTURAS (INVOICE ARCHIVE)
  // ----------------------------------------------------
  async function renderInvoicesArchive() {
    const grid = document.getElementById('invoicesGrid');
    const invoices = await window.db.getInvoices();

    if (invoices.length === 0) {
      grid.innerHTML = `
        <div class="col-span-full text-center py-12 text-slate-500">
          <p class="text-3xl mb-2">🗃️</p>
          <p class="font-semibold text-slate-300">No hay facturas archivadas</p>
          <p class="text-xs text-slate-500 mt-1">Escanea tu primera factura para guardarla comprimida.</p>
        </div>
      `;
      return;
    }

    grid.innerHTML = invoices.map(inv => {
      const hasPhoto = !!inv.photo_compressed_base64;
      const photoThumb = hasPhoto 
        ? `<img src="${inv.photo_compressed_base64}" alt="Factura" class="w-full h-36 object-cover rounded-lg border border-slate-700">`
        : `<div class="w-full h-36 bg-slate-900 rounded-lg flex items-center justify-center text-slate-600 text-3xl">🧾</div>`;

      return `
        <div class="app-card">
          <div>
            <div class="mb-3">${photoThumb}</div>
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold text-blue-400">${escapeHtml(inv.store_name)}</span>
              <span class="text-[10px] text-slate-400">${inv.date}</span>
            </div>
            <div class="flex items-center justify-between mt-2 pt-2 border-t border-slate-800">
              <span class="text-xs text-slate-400">${inv.items_count || (inv.items_json ? inv.items_json.length : 0)} ítems</span>
              <span class="font-black text-emerald-400 text-sm">$ ${(inv.total_usd || 0).toFixed(2)}</span>
            </div>
          </div>
          <div class="card-footer mt-3">
            <span class="text-[10px] text-slate-500">~${Math.round((inv.photo_size_bytes || 25000) / 1024)} KB WebP</span>
            <button class="btn btn-secondary btn-sm btn-view-invoice" data-id="${inv.id}">
              🔍 Ver Factura
            </button>
          </div>
        </div>
      `;
    }).join('');

    document.querySelectorAll('.btn-view-invoice').forEach(btn => {
      btn.addEventListener('click', async () => {
        const inv = await window.db.getById('invoices', parseInt(btn.dataset.id));
        if (inv) {
          document.getElementById('invDetailStore').textContent = inv.store_name;
          document.getElementById('invDetailDate').textContent = `${inv.date} • Tasa: Bs. ${(inv.bcv_rate || 0).toFixed(2)}`;
          document.getElementById('invDetailTotals').textContent = `$ ${(inv.total_usd || 0).toFixed(2)} / Bs. ${(inv.total_ves || 0).toFixed(2)}`;
          
          const photoImg = document.getElementById('invDetailPhoto');
          if (inv.photo_compressed_base64) {
            photoImg.src = inv.photo_compressed_base64;
            document.getElementById('invDetailPhotoContainer').classList.remove('hidden');
          } else {
            document.getElementById('invDetailPhotoContainer').classList.add('hidden');
          }

          document.getElementById('invDetailSize').textContent = `Peso en BD: ${Math.round((inv.photo_size_bytes || 0) / 1024)} KB (WebP)`;

          const itemsTbody = document.getElementById('invDetailItemsTable');
          itemsTbody.innerHTML = (inv.items_json || []).map(item => `
            <tr>
              <td class="p-2 text-slate-200">${escapeHtml(item.name)}</td>
              <td class="p-2 text-right font-bold text-slate-100">$ ${(item.price || 0).toFixed(2)}</td>
            </tr>
          `).join('');

          openModal('modalInvoiceDetail');
        }
      });
    });
  }

  // ----------------------------------------------------
  // 7. AJUSTES, RESPALDO Y GOOGLE DRIVE
  // ----------------------------------------------------
  async function loadSettingsForm() {
    const key = await window.aiScanner.getApiKey();
    document.getElementById('inputGeminiApiKey').value = key || '';

    const syncEnabled = await window.db.getSetting('drive_sync_enabled', false);
    const driveToggle = document.getElementById('toggleDriveSync');
    if (driveToggle) {
      driveToggle.checked = syncEnabled && window.authGroups.isLoggedIn();
    }
    updateDriveStatusUI(syncEnabled);
  }

  function updateDriveStatusUI(enabled) {
    const statusDesc = document.getElementById('driveStatusDesc');
    const pill = document.getElementById('drivePillBtn');
    const pillText = document.getElementById('drivePillText');
    const emailEl = document.getElementById('driveAccountEmail');
    const iconEl = document.getElementById('driveAccountIcon');
    const btnConnect = document.getElementById('btnDriveConnectGoogle');
    const driveToggle = document.getElementById('toggleDriveSync');

    const user = window.authGroups ? window.authGroups.getCurrentUser() : null;

    if (user && user.email) {
      if (emailEl) emailEl.textContent = user.email;
      if (iconEl) {
        iconEl.innerHTML = user.photoURL 
          ? `<img src="${user.photoURL}" class="w-5 h-5 rounded-full inline object-cover border border-blue-500 shadow">` 
          : '👤';
      }
      if (btnConnect) {
        btnConnect.textContent = 'Cambiar Cuenta';
        btnConnect.className = 'btn btn-secondary btn-sm text-[11px] py-1 px-2.5 flex-shrink-0';
      }

      if (enabled) {
        if (statusDesc) statusDesc.textContent = `Sincronizando con ${user.email}`;
        if (pill) pill.classList.remove('disabled');
        if (pillText) pillText.textContent = 'Drive: Activo';
        if (driveToggle) driveToggle.checked = true;
      } else {
        if (statusDesc) statusDesc.textContent = 'Pausada por el usuario';
        if (pill) pill.classList.add('disabled');
        if (pillText) pillText.textContent = 'Drive: Pausado';
        if (driveToggle) driveToggle.checked = false;
      }
    } else {
      // Sin sesión iniciada con Google
      if (emailEl) emailEl.textContent = 'No has iniciado sesión con Google';
      if (iconEl) iconEl.textContent = '⚠️';
      if (btnConnect) {
        btnConnect.textContent = 'Iniciar Sesión';
        btnConnect.className = 'btn btn-primary btn-sm text-[11px] py-1 px-2.5 flex-shrink-0';
      }
      if (statusDesc) statusDesc.textContent = 'Requiere iniciar sesión con Google';
      if (pill) pill.classList.add('disabled');
      if (pillText) pillText.textContent = 'Drive';
      if (driveToggle) driveToggle.checked = false;
    }

    // Actualizar texto de última sincronización
    const lastSyncTimeEl = document.getElementById('driveLastSyncTime');
    if (lastSyncTimeEl) {
      if (window.backupDrive && window.backupDrive.lastSync) {
        try {
          const d = new Date(window.backupDrive.lastSync);
          lastSyncTimeEl.textContent = d.toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' });
        } catch {
          lastSyncTimeEl.textContent = 'Reciente';
        }
      } else {
        lastSyncTimeEl.textContent = 'Nunca';
      }
    }
  }

  // ----------------------------------------------------
  // GESTIÓN REACTIVA DE CLAVE API GEMINI & GUÍA
  // ----------------------------------------------------
  async function updateApiKeyUI() {
    const key = (await window.aiScanner.getApiKey() || '').trim();
    const hasKey = key.length > 5;
    const masked = hasKey ? `${key.slice(0, 6)}...${key.slice(-4)}` : '';

    // 1. Badge en la vista Escáner
    const scannerBadge = document.getElementById('scannerApiKeyBadge');
    if (scannerBadge) {
      if (hasKey) {
        scannerBadge.className = 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
        scannerBadge.textContent = `🟢 Activa (${masked})`;
      } else {
        scannerBadge.className = 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30';
        scannerBadge.textContent = '⚠️ No configurada';
      }
    }

    // 2. Badge & Preview en la vista Ajustes
    const settingsBadge = document.getElementById('settingsApiKeyBadge');
    if (settingsBadge) {
      if (hasKey) {
        settingsBadge.className = 'px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
        settingsBadge.textContent = '🟢 Activa';
      } else {
        settingsBadge.className = 'px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30';
        settingsBadge.textContent = '🟠 Sin configurar';
      }
    }

    const settingsPreview = document.getElementById('settingsApiKeyPreview');
    if (settingsPreview) {
      settingsPreview.textContent = hasKey ? `Configurada (${masked})` : 'Sin configurar';
    }

    const settingsInput = document.getElementById('inputGeminiApiKey');
    if (settingsInput) {
      settingsInput.value = key;
    }

    // 3. Elementos en el Modal
    const modalDot = document.getElementById('modalApiKeyStatusDot');
    const modalText = document.getElementById('modalApiKeyStatusText');
    const modalBadge = document.getElementById('modalApiKeyStatusBadge');
    const modalInput = document.getElementById('modalInputGeminiApiKey');

    if (modalDot) modalDot.className = `w-2.5 h-2.5 rounded-full ${hasKey ? 'bg-emerald-400' : 'bg-amber-400'} flex-shrink-0`;
    if (modalText) modalText.textContent = hasKey ? `Clave Activa: ${masked}` : 'Sin clave configurada';
    if (modalBadge) {
      if (hasKey) {
        modalBadge.className = 'px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex-shrink-0';
        modalBadge.textContent = '🟢 Lista para Escaneo';
      } else {
        modalBadge.className = 'px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex-shrink-0';
        modalBadge.textContent = '🟠 Se requiere clave';
      }
    }
    if (modalInput) {
      modalInput.value = key;
    }
  }

  // ----------------------------------------------------
  // GESTIÓN REACTIVA DE NIVEL DE MODELO (FLASH vs PRO)
  // ----------------------------------------------------
  async function updateModelTierUI() {
    if (!window.aiScanner || !window.aiScanner.getModelTier) return;
    activeModelTier = await window.aiScanner.getModelTier();
    const isPro = activeModelTier === 'pro';

    // 1. Selector en vista Escáner
    const scannerIcon = document.getElementById('scannerTierIcon');
    if (scannerIcon) {
      scannerIcon.textContent = isPro ? '⭐' : '⚡';
      scannerIcon.className = `w-8 h-8 rounded-xl ${isPro ? 'bg-amber-500/20 text-amber-300' : 'bg-blue-500/10 text-blue-400'} flex items-center justify-center font-bold text-base flex-shrink-0`;
    }

    const scannerBadge = document.getElementById('scannerTierBadge');
    if (scannerBadge) {
      if (isPro) {
        scannerBadge.className = 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30';
        scannerBadge.textContent = '⭐ Gemini Pro (Clase Especial)';
      } else {
        scannerBadge.className = 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30';
        scannerBadge.textContent = '⚡ Gemini Flash (Gratuito)';
      }
    }

    const scannerHint = document.getElementById('scannerTierHint');
    if (scannerHint) {
      scannerHint.textContent = isPro
        ? '⭐ Clase Especial activa: Máxima precisión, razonamiento avanzado y sin saturación'
        : '⚡ Flash: Rápido y gratis • ⭐ Pro: Clase especial con máxima precisión';
    }

    // Botones de nivel en Escáner y Ajustes
    document.querySelectorAll('.btn-model-tier').forEach(btn => {
      const tier = btn.dataset.tier;
      const isSelected = tier === activeModelTier;
      if (isSelected) {
        if (tier === 'pro') {
          btn.className = 'btn-model-tier px-2.5 sm:px-3 py-1 rounded-lg text-xs font-bold transition bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow';
        } else {
          btn.className = 'btn-model-tier px-2.5 sm:px-3 py-1 rounded-lg text-xs font-bold transition bg-blue-600 text-white shadow';
        }
      } else {
        btn.className = 'btn-model-tier px-2.5 sm:px-3 py-1 rounded-lg text-xs font-bold transition text-slate-400 hover:text-slate-200';
      }
    });

    // 2. Descripción en Ajustes
    const settingsDesc = document.getElementById('settingsTierDesc');
    if (settingsDesc) {
      settingsDesc.textContent = isPro ? '⭐ Gemini Pro (Clase Especial / Mayor Nivel)' : '⚡ Gemini Flash (100% Gratuito)';
    }

    // 3. Modal de Clave API
    const modalBadge = document.getElementById('modalSelectedTierBadge');
    if (modalBadge) {
      modalBadge.textContent = isPro ? '⭐ Gemini Pro (Clase Especial)' : '⚡ Gemini Flash (Gratuito)';
      modalBadge.className = `text-[11px] font-bold ${isPro ? 'text-amber-300' : 'text-blue-400'}`;
    }

    document.querySelectorAll('.btn-modal-tier').forEach(btn => {
      const tier = btn.dataset.tier;
      const isSelected = tier === activeModelTier;
      if (isSelected) {
        if (tier === 'pro') {
          btn.className = 'btn-modal-tier p-2.5 rounded-xl border text-left transition bg-amber-500/15 border-amber-500/60 ring-2 ring-amber-500/30';
        } else {
          btn.className = 'btn-modal-tier p-2.5 rounded-xl border text-left transition bg-blue-500/15 border-blue-500/60 ring-2 ring-blue-500/30';
        }
      } else {
        btn.className = 'btn-modal-tier p-2.5 rounded-xl border text-left transition bg-slate-900 border-slate-800 opacity-60 hover:opacity-100';
      }
    });

    updateProcessBtnLabel();
  }

  async function handleSaveApiKey(keyValue) {
    const cleanKey = (keyValue || '').trim();
    if (!cleanKey) {
      showToast('Por favor ingresa una clave API válida de Gemini (inicia con AIzaSy...)', 'error');
      return;
    }
    await window.aiScanner.setApiKey(cleanKey);
    await updateApiKeyUI();
    await updateModelTierUI();
    showToast('¡Clave de Google Gemini guardada exitosamente!', 'success');
  }

  async function handleTestApiKey(keyValue, btnElement) {
    const key = (keyValue || await window.aiScanner.getApiKey() || '').trim();
    if (!key) {
      showToast('Primero ingresa o guarda una clave API para poder probarla', 'error');
      return;
    }

    const originalText = btnElement ? btnElement.innerHTML : '';
    if (btnElement) {
      btnElement.disabled = true;
      btnElement.innerHTML = '⏳ Conectando...';
    }

    try {
      const isPro = activeModelTier === 'pro';
      showToast(isPro ? 'Verificando conexión con Google Gemini Pro...' : 'Verificando conexión con Google Gemini Flash...', 'info');
      const testRes = await window.aiScanner.testApiKey(key);
      showToast(`¡Conexión exitosa! Tu API Key de Gemini (${testRes.model}) es válida y está activa.`, 'success');
    } catch (err) {
      console.error(err);
      showToast('Error de conexión: ' + err.message, 'error');
    } finally {
      if (btnElement) {
        btnElement.disabled = false;
        btnElement.innerHTML = originalText;
      }
    }
  }

  async function handleRemoveApiKey() {
    if (confirm('¿Estás seguro de que deseas eliminar la clave API de Gemini guardada? No podrás escanear con IA hasta que agregues una nueva.')) {
      await window.aiScanner.removeApiKey();
      await updateApiKeyUI();
      await updateModelTierUI();
      showToast('Clave API eliminada correctamente', 'info');
    }
  }

  // Botones de Abrir Modal de Clave & Guía
  const btnOpenApiKeyModalScanner = document.getElementById('btnOpenApiKeyModalScanner');
  if (btnOpenApiKeyModalScanner) {
    btnOpenApiKeyModalScanner.addEventListener('click', () => {
      updateApiKeyUI();
      updateModelTierUI();
      openModal('modalGeminiApiKey');
    });
  }

  const btnOpenApiKeyGuideScanner = document.getElementById('btnOpenApiKeyGuideScanner');
  if (btnOpenApiKeyGuideScanner) {
    btnOpenApiKeyGuideScanner.addEventListener('click', () => {
      updateApiKeyUI();
      updateModelTierUI();
      openModal('modalGeminiApiKey');
    });
  }

  const btnOpenApiKeyModalSettings = document.getElementById('btnOpenApiKeyModalSettings');
  if (btnOpenApiKeyModalSettings) {
    btnOpenApiKeyModalSettings.addEventListener('click', () => {
      updateApiKeyUI();
      updateModelTierUI();
      openModal('modalGeminiApiKey');
    });
  }

  // Toggles de visibilidad (Mostrar / Ocultar con ojo)
  const btnToggleModalApiKeyVis = document.getElementById('btnToggleModalApiKeyVis');
  if (btnToggleModalApiKeyVis) {
    btnToggleModalApiKeyVis.addEventListener('click', () => {
      const input = document.getElementById('modalInputGeminiApiKey');
      if (input) {
        input.type = input.type === 'password' ? 'text' : 'password';
        btnToggleModalApiKeyVis.textContent = input.type === 'password' ? '👁️' : '🙈';
      }
    });
  }

  const btnToggleSettingsApiKeyVis = document.getElementById('btnToggleApiKeyVisibilitySettings');
  if (btnToggleSettingsApiKeyVis) {
    btnToggleSettingsApiKeyVis.addEventListener('click', () => {
      const input = document.getElementById('inputGeminiApiKey');
      if (input) {
        input.type = input.type === 'password' ? 'text' : 'password';
        btnToggleSettingsApiKeyVis.textContent = input.type === 'password' ? '👁️' : '🙈';
      }
    });
  }

  // Botones de Guardar Clave
  const btnSaveModalApiKey = document.getElementById('btnSaveModalApiKey');
  if (btnSaveModalApiKey) {
    btnSaveModalApiKey.addEventListener('click', async () => {
      const val = document.getElementById('modalInputGeminiApiKey').value;
      await handleSaveApiKey(val);
    });
  }

  const btnSaveSettingsKey = document.getElementById('btnSaveGeminiKey');
  if (btnSaveSettingsKey) {
    btnSaveSettingsKey.addEventListener('click', async () => {
      const val = document.getElementById('inputGeminiApiKey').value;
      await handleSaveApiKey(val);
    });
  }

  // Botones de Probar Conexión
  const btnTestModalApiKey = document.getElementById('btnTestModalApiKey');
  if (btnTestModalApiKey) {
    btnTestModalApiKey.addEventListener('click', () => {
      const val = document.getElementById('modalInputGeminiApiKey').value;
      handleTestApiKey(val, btnTestModalApiKey);
    });
  }

  const btnTestSettingsKey = document.getElementById('btnTestGeminiKeySettings');
  if (btnTestSettingsKey) {
    btnTestSettingsKey.addEventListener('click', () => {
      const val = document.getElementById('inputGeminiApiKey').value;
      handleTestApiKey(val, btnTestSettingsKey);
    });
  }

  // Botones de Eliminar Clave
  const btnDeleteModalApiKey = document.getElementById('btnDeleteModalApiKey');
  if (btnDeleteModalApiKey) {
    btnDeleteModalApiKey.addEventListener('click', handleRemoveApiKey);
  }

  const btnRemoveSettingsKey = document.getElementById('btnRemoveGeminiKeySettings');
  if (btnRemoveSettingsKey) {
    btnRemoveSettingsKey.addEventListener('click', handleRemoveApiKey);
  }

  // Selector de Nivel de Modelo (Flash vs Pro)
  document.querySelectorAll('.btn-model-tier').forEach(btn => {
    btn.addEventListener('click', async () => {
      const tier = btn.dataset.tier;
      if (!tier) return;
      await window.aiScanner.setModelTier(tier);
      await updateModelTierUI();
      if (tier === 'pro') {
        showToast('⭐ Nivel Gemini Pro (Clase Especial) activado', 'success');
      } else {
        showToast('⚡ Nivel Gemini Flash (Gratuito) activado', 'info');
      }
    });
  });

  document.querySelectorAll('.btn-modal-tier').forEach(btn => {
    btn.addEventListener('click', async () => {
      const tier = btn.dataset.tier;
      if (!tier) return;
      await window.aiScanner.setModelTier(tier);
      await updateModelTierUI();
      if (tier === 'pro') {
        showToast('⭐ Nivel Gemini Pro (Clase Especial) seleccionado', 'success');
      } else {
        showToast('⚡ Nivel Gemini Flash (Gratuito) seleccionado', 'info');
      }
    });
  });

  const btnDriveConnect = document.getElementById('btnDriveConnectGoogle');
  if (btnDriveConnect) {
    btnDriveConnect.addEventListener('click', () => {
      openModal('modalGoogleLogin');
    });
  }

  document.getElementById('toggleDriveSync').addEventListener('change', async (e) => {
    const user = window.authGroups ? window.authGroups.getCurrentUser() : null;
    if (!user || !user.email) {
      e.target.checked = false;
      showToast('⚠️ Es necesario iniciar sesión con Google para sincronizar con Google Drive', 'error');
      openModal('modalGoogleLogin');
      return;
    }

    const enabled = e.target.checked;
    await window.backupDrive.toggleDriveSync(enabled, user.email);
    updateDriveStatusUI(enabled);
    showToast(enabled ? `Sincronización con Google Drive activada para ${user.email}` : 'Sincronización con Google Drive pausada', 'info');
  });

  // Subir Respaldo a Google Drive
  const btnManualDriveSync = document.getElementById('btnManualDriveSync');
  if (btnManualDriveSync) {
    btnManualDriveSync.addEventListener('click', async () => {
      const user = window.authGroups ? window.authGroups.getCurrentUser() : null;
      if (!user || !user.email) {
        showToast('⚠️ Es necesario iniciar sesión con Google para respaldar en Google Drive', 'error');
        openModal('modalGoogleLogin');
        return;
      }

      const noticeEl = document.getElementById('driveApiDisabledNotice');
      if (noticeEl) noticeEl.classList.add('hidden');

      try {
        showToast(`Conectando con Google Drive (${user.email})...`, 'info');
        const res = await window.backupDrive.uploadToGoogleDrive();
        showToast(`¡Respaldo guardado en Google Drive! (${res.storesCount} tiendas, ${res.productsCount} productos)`, 'success');
        updateDriveStatusUI(true);
      } catch (err) {
        console.error('Error al subir a Drive:', err);
        if (err.message === 'GOOGLE_DRIVE_API_DISABLED') {
          if (noticeEl) noticeEl.classList.remove('hidden');
          showToast('⚠️ Debes habilitar la Google Drive API en Google Cloud para sincronizar', 'error');
        } else {
          showToast(err.message, 'error');
        }
      }
    });
  }

  // Descargar / Restaurar Respaldo desde Google Drive
  const btnRestoreDriveSync = document.getElementById('btnRestoreDriveSync');
  if (btnRestoreDriveSync) {
    btnRestoreDriveSync.addEventListener('click', async () => {
      const user = window.authGroups ? window.authGroups.getCurrentUser() : null;
      if (!user || !user.email) {
        showToast('⚠️ Es necesario iniciar sesión con Google para descargar desde Google Drive', 'error');
        openModal('modalGoogleLogin');
        return;
      }

      const noticeEl = document.getElementById('driveApiDisabledNotice');
      if (noticeEl) noticeEl.classList.add('hidden');

      try {
        showToast(`Consultando respaldo en Google Drive (${user.email})...`, 'info');
        const driveData = await window.backupDrive.downloadFromGoogleDrive();
        const payload = driveData.payload;
        const meta = payload.metadata || {};
        const dateStr = payload.export_date ? new Date(payload.export_date).toLocaleString('es-VE') : 'Reciente';

        const confirmMsg = `Se encontró un respaldo en Google Drive:\n• Tiendas: ${meta.stores_count || 0}\n• Productos: ${meta.products_count || 0}\n• Fecha: ${dateStr}\n\n¿Deseas descargar e importar esta información en este dispositivo?`;
        if (confirm(confirmMsg)) {
          showToast('Restaurando datos desde Google Drive...', 'info');
          const importRes = await window.backupDrive.executeImport(payload, 'ALL', 'UPDATE_PRICES_ONLY');
          showToast(`¡Restauración exitosa! (${importRes.importedStoresCount} tiendas añadidas/actualizadas, ${importRes.importedProductsCount + importRes.updatedProductsCount} productos)`, 'success');
          renderStores();
          renderProducts();
          updateDriveStatusUI(true);
        }
      } catch (err) {
        console.error('Error al restaurar de Drive:', err);
        if (err.message === 'GOOGLE_DRIVE_API_DISABLED') {
          if (noticeEl) noticeEl.classList.remove('hidden');
          showToast('⚠️ Debes habilitar la Google Drive API en Google Cloud para sincronizar', 'error');
        } else {
          showToast(err.message, 'error');
        }
      }
    });
  }

  // Acciones en Modal de Cuenta de Google
  const btnModalSyncDrive = document.getElementById('btnGoogleModalSyncDrive');
  if (btnModalSyncDrive) {
    btnModalSyncDrive.addEventListener('click', () => {
      closeModal('modalGoogleLogin');
      switchView('settings');
      setTimeout(() => {
        const driveCard = document.getElementById('driveAccountInfo');
        if (driveCard) driveCard.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    });
  }

  const btnModalGoSettings = document.getElementById('btnGoogleModalGoSettings');
  if (btnModalGoSettings) {
    btnModalGoSettings.addEventListener('click', () => {
      closeModal('modalGoogleLogin');
      switchView('settings');
    });
  }

  // Píldora de Drive en cabecera
  const drivePillBtn = document.getElementById('drivePillBtn');
  if (drivePillBtn) {
    drivePillBtn.addEventListener('click', async () => {
      const user = window.authGroups ? window.authGroups.getCurrentUser() : null;
      if (!user || !user.email) {
        showToast('⚠️ Es necesario iniciar sesión con Google para respaldar en Google Drive', 'error');
        openModal('modalGoogleLogin');
        return;
      }

      if (!window.backupDrive.syncEnabled) {
        await window.backupDrive.toggleDriveSync(true, user.email);
        updateDriveStatusUI(true);
      }

      try {
        showToast(`Sincronizando con Google Drive (${user.email})...`, 'info');
        const res = await window.backupDrive.uploadToGoogleDrive();
        showToast(`¡Respaldo sincronizado en Google Drive (${user.email})!`, 'success');
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  // Exportar Respaldo
  document.getElementById('btnDownloadBackup').addEventListener('click', async () => {
    const appendSuffix = document.getElementById('chkExportNumberedStores').checked;
    const includeHistory = document.getElementById('chkExportIncludeHistory').checked;
    const includeExpenses = document.getElementById('chkExportIncludeExpenses').checked;

    showToast('Generando archivo de respaldo...', 'info');

    const result = await window.backupDrive.downloadBackupFile({
      storeIds: 'ALL',
      productIds: 'ALL',
      includeHistory,
      includeExpenses,
      appendNumericSuffix: appendSuffix
    });

    showToast(`Respaldo descargado: ${result.filename}`, 'success');
  });

  // Importar Respaldo
  document.getElementById('btnTriggerImportFile').addEventListener('click', () => {
    document.getElementById('inputImportBackupFile').click();
  });

  document.getElementById('inputImportBackupFile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const inspection = await window.backupDrive.inspectBackupFile(file);
      pendingImportPayload = inspection.rawPayload;

      // Mostrar resumen en modal inspector
      document.getElementById('importStatsOverview').innerHTML = `
        <p><strong>Fecha del respaldo:</strong> ${inspection.exportDate.split('T')[0]}</p>
        <p><strong>Tiendas contenidas:</strong> ${inspection.stores.length}</p>
        <p><strong>Total Productos:</strong> ${inspection.totalProducts}</p>
        <p><strong>Total Asientos Contables:</strong> ${inspection.totalExpenses}</p>
      `;

      // Checkbox list de tiendas
      const listContainer = document.getElementById('importStoresList');
      listContainer.innerHTML = inspection.stores.map(s => `
        <label class="flex items-center justify-between p-2 rounded bg-slate-800/60 text-xs">
          <div class="flex items-center gap-2">
            <input type="checkbox" class="import-store-chk" value="${s.id}" checked>
            <span class="font-bold text-slate-100">${escapeHtml(s.name)}</span>
            <span class="text-slate-400">(${s.productsCount} prods)</span>
          </div>
          ${s.conflict ? '<span class="px-1.5 py-0.5 rounded text-[10px] bg-amber-500/20 text-amber-300 font-bold">Ya existe</span>' : '<span class="text-[10px] text-emerald-400 font-bold">Nueva</span>'}
        </label>
      `).join('');

      openModal('modalImportInspector');
    } catch (err) {
      showToast('Error al inspeccionar respaldo: ' + err.message, 'error');
    } finally {
      e.target.value = '';
    }
  });

  document.getElementById('btnExecuteFinalImport').addEventListener('click', async () => {
    if (!pendingImportPayload) return;

    const selectedCheckboxes = document.querySelectorAll('.import-store-chk:checked');
    const selectedStoreIds = Array.from(selectedCheckboxes).map(c => parseInt(c.value));
    const strategy = document.getElementById('importConflictStrategy').value;

    if (selectedStoreIds.length === 0) {
      showToast('Selecciona al menos una tienda para importar', 'error');
      return;
    }

    try {
      const res = await window.backupDrive.executeImport(pendingImportPayload, selectedStoreIds, strategy);
      showToast(`¡Importación lista! ${res.importedStoresCount} tiendas añadidas, ${res.importedProductsCount} productos nuevos.`, 'success');
      closeModal('modalImportInspector');
      pendingImportPayload = null;
      renderStores();
    } catch (err) {
      showToast('Fallo en la importación: ' + err.message, 'error');
    }
  });

  // Borrar Toda la Base de Datos (Doble Confirmación de Seguridad)
  const btnDeleteDb = document.getElementById('btnDeleteEntireDatabase');
  if (btnDeleteDb) {
    btnDeleteDb.addEventListener('click', async () => {
      if (!window.authGroups.hasPermission('can_manage_catalog')) {
        showToast('⚠️ No tienes permiso para borrar la base de datos en este grupo.', 'error');
        return;
      }

      // PREGUNTA 1: Primer aviso detallado con advertencia de pérdidas
      const confirmacion1 = confirm(
        '⚠️ AVISO DE SEGURIDAD (Paso 1 de 2):\n\n' +
        '¿Estás seguro de que deseas borrar TODA la base de datos de la aplicación?\n\n' +
        'Esta acción eliminará de forma PERMANENTE e IRREVERSIBLE:\n' +
        '• Todas las tiendas y comercios registrados.\n' +
        '• Todos los productos, precios y valoraciones de calidad.\n' +
        '• Todo el historial histórico de precios y gráficas.\n' +
        '• Todos los registros de gastos, facturas e imágenes guardadas.\n\n' +
        '¿Deseas continuar al paso final de confirmación?'
      );

      if (!confirmacion1) return;

      // PREGUNTA 2: Segundo aviso de confirmación definitiva
      const confirmacion2 = confirm(
        '🚨 ÚLTIMA ADVERTENCIA DE SEGURIDAD (Paso 2 de 2):\n\n' +
        '¡ATENCIÓN! No habrá manera de recuperar la información eliminada salvo que dispongas de un respaldo previo en Google Drive.\n\n' +
        '¿Confirmas DEFINITIVAMENTE que deseas BORRAR TODOS LOS DATOS ahora mismo?'
      );

      if (!confirmacion2) {
        showToast('Operación cancelada. Tus datos están seguros.', 'info');
        return;
      }

      try {
        await window.db.clearAllPersonalData();
        plannerCart.clear();
        await renderStores();
        await renderProducts();
        if (currentModalStoreId) renderStoreModalProductsList();
        renderPlannerCart();
        loadPlannerProductList();
        if (typeof renderAccounting === 'function') await renderAccounting();

        showToast('🗑️ Toda la base de datos ha sido borrada con éxito. La app quedó 100% limpia.', 'success');
      } catch (err) {
        console.error('Error al borrar la base de datos:', err);
        showToast('Error al borrar la base de datos: ' + err.message, 'error');
      }
    });
  }

  // ----------------------------------------------------
  // GEOFENCING Y PERMISOS DE UBICACIÓN EN TIEMPO REAL
  // ----------------------------------------------------
  function initLocationPermissionCheck() {
    if (!navigator.geolocation) {
      console.warn('Geolocalización no soportada por el navegador.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        window.userCurrentLocation = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude
        };
        console.log('📍 Permiso de ubicación en tiempo real concedido:', window.userCurrentLocation);
      },
      (err) => {
        console.warn('Permiso de ubicación denegado o no disponible:', err.message);
        // Si el usuario bloqueó el permiso (código 1 PERMISSION_DENIED)
        if (err.code === 1 || err.code === err.PERMISSION_DENIED) {
          const alreadyNotified = sessionStorage.getItem('location_denied_notified');
          if (!alreadyNotified) {
            sessionStorage.setItem('location_denied_notified', 'true');
            setTimeout(() => {
              openModal('modalLocationDenied');
            }, 600);
          }
        }
      },
      { timeout: 8000, enableHighAccuracy: true, maximumAge: 60000 }
    );
  }

  const btnRetryLoc = document.getElementById('btnRetryLocationPerm');
  if (btnRetryLoc) {
    btnRetryLoc.addEventListener('click', () => {
      closeModal('modalLocationDenied');
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          window.userCurrentLocation = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude
          };
          showToast('¡Ubicación en tiempo real concedida!', 'success');
        },
        (err) => {
          showToast('Sigue bloqueada. Actívala en el candado 🔒 de tu navegador.', 'error');
        },
        { enableHighAccuracy: true, timeout: 8000 }
      );
    });
  }

  // ----------------------------------------------------
  // INICIO DE SESIÓN OFICIAL CON GOOGLE (GIS / OAUTH 2.0)
  // ----------------------------------------------------
  function decodeJwtResponse(token) {
    try {
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));
      return JSON.parse(jsonPayload);
    } catch (e) {
      console.error('Error decodificando token de Google:', e);
      return null;
    }
  }

  // Redirección oficial a Google OAuth 2.0 (accounts.google.com)
  function redirectToGoogleOAuth(clientId) {
    const finalId = clientId || GOOGLE_CLIENT_ID_CONFIG;
    if (!finalId) {
      showToast('Se requiere un Client ID de Google Cloud para abrir accounts.google.com', 'error');
      const notice = document.getElementById('googleClientSetupNotice');
      if (notice) notice.classList.remove('hidden');
      const input = document.getElementById('inputGoogleClientId');
      if (input) input.focus();
      return;
    }

    // Redirección oficial limpia (normalizada tanto para GitHub Pages como para localhost)
    let redirectUri = window.location.origin + window.location.pathname;
    if (redirectUri.endsWith('index.html')) {
      redirectUri = redirectUri.slice(0, -'index.html'.length);
    }
    if (!redirectUri.endsWith('/')) {
      redirectUri += '/';
    }
    const state = 'google_oauth_' + Math.random().toString(36).substring(2, 12);
    try {
      sessionStorage.setItem('oauth_state', state);
    } catch (e) {}

    const scope = encodeURIComponent('email profile openid');
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${encodeURIComponent(finalId)}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `response_type=token&` +
      `scope=${scope}&` +
      `state=${encodeURIComponent(state)}&` +
      `prompt=select_account`;

    showToast('Abriendo ventana oficial de Google...', 'info');
    window.location.assign(authUrl);
  }

  // Verificación de callback tras la redirección desde accounts.google.com
  async function checkGoogleOAuthCallback() {
    const hash = window.location.hash;
    if (!hash || !hash.includes('access_token=')) {
      return;
    }

    try {
      const rawHash = hash.startsWith('#') ? hash.slice(1) : hash;
      const params = new URLSearchParams(rawHash);
      const accessToken = params.get('access_token');
      const error = params.get('error');

      // Limpiar el hash de la barra de direcciones inmediatamente para proteger el token
      const cleanUrl = window.location.pathname + window.location.search;
      window.history.replaceState(null, '', cleanUrl);

      if (error) {
        console.error('Google OAuth error:', error);
        showToast(`Error de autenticación con Google: ${error}`, 'error');
        return;
      }

      if (!accessToken) return;

      showToast('Verificando credenciales oficiales con Google...', 'info');

      // Obtener perfil verificado desde la API oficial de Google UserInfo
      const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      if (!res.ok) {
        throw new Error(`Google API respondió con código HTTP ${res.status}`);
      }

      const profile = await res.json();
      if (!profile || !profile.email) {
        throw new Error('Google no devolvió un correo válido.');
      }

      // Iniciar sesión y guardar correo verificado
      await window.authGroups.signInWithGoogle(profile.email, profile.name, profile.picture);
      closeModal('modalGoogleLogin');
      showToast(`¡Sesión oficial verificada! Bienvenido/a, ${profile.name || profile.email}`, 'success');
    } catch (err) {
      console.error('Error al procesar callback de Google OAuth:', err);
      showToast(`Error al validar cuenta con Google: ${err.message}`, 'error');
    }
  }

  async function getAppGoogleClientId() {
    if (typeof GOOGLE_CLIENT_ID_CONFIG !== 'undefined' && GOOGLE_CLIENT_ID_CONFIG && GOOGLE_CLIENT_ID_CONFIG.trim()) {
      return GOOGLE_CLIENT_ID_CONFIG.trim();
    }
    const saved = await window.db.getSetting('google_client_id');
    return saved ? saved.trim() : '';
  }

  async function initGoogleOfficialGis() {
    const savedClientId = await getAppGoogleClientId();
    const inputClientEl = document.getElementById('inputGoogleClientId');
    const setupCard = document.getElementById('googleClientSetupNotice');
    const container = document.getElementById('googleGisButtonContainer');
    const btnDirect = document.getElementById('btnGoogleDirectRedirect');

    if (inputClientEl && savedClientId) {
      inputClientEl.value = savedClientId;
    }

    // Vincular botón directo a accounts.google.com
    if (btnDirect) {
      const handleDirectClick = async (e) => {
        if (e) e.preventDefault();
        const clientId = await getAppGoogleClientId();
        if (clientId) {
          redirectToGoogleOAuth(clientId);
        } else {
          showToast('Google requiere vincular el proyecto con Google Cloud (Ver instrucciones del desarrollador)', 'info');
        }
      };
      btnDirect.onclick = handleDirectClick;
    }

    if (!container) return;

    if (!savedClientId) {
      container.innerHTML = '';
      return;
    }

    if (setupCard) setupCard.classList.add('hidden');

    let gisAttempts = 0;
    function renderGis() {
      gisAttempts++;
      if (window.google && window.google.accounts && window.google.accounts.id) {
        try {
          window.google.accounts.id.initialize({
            client_id: savedClientId,
            callback: async (response) => {
              const payload = decodeJwtResponse(response.credential);
              if (payload && payload.email) {
                await window.authGroups.signInWithGoogle(payload.email, payload.name, payload.picture);
                showToast(`¡Sesión oficial verificada con Google: ${payload.name}!`, 'success');
                closeModal('modalGoogleLogin');
              } else {
                showToast('No se pudo verificar el token oficial de Google', 'error');
              }
            },
            auto_select: false,
            cancel_on_tap_outside: true
          });

          container.innerHTML = '';
          window.google.accounts.id.renderButton(container, {
            theme: 'outline',
            size: 'large',
            shape: 'pill',
            text: 'continue_with',
            width: 280
          });

          // Al renderizarse el botón oficial de Google, ocultamos el botón manual para que haya UN SOLO botón limpio
          if (btnDirect) btnDirect.classList.add('hidden');
        } catch (err) {
          console.warn('GIS renderButton error:', err);
          if (btnDirect) btnDirect.classList.remove('hidden');
        }
      } else if (gisAttempts < 10) {
        setTimeout(renderGis, 300);
      } else {
        // Si el script oficial de Google no cargó tras 3 segundos, mostrar el botón de respaldo
        if (btnDirect) btnDirect.classList.remove('hidden');
      }
    }

    renderGis();
  }

  const btnSaveGClient = document.getElementById('btnSaveGoogleClientId');
  if (btnSaveGClient) {
    btnSaveGClient.onclick = async () => {
      const val = (document.getElementById('inputGoogleClientId').value || '').trim();
      if (!val) {
        showToast('Ingresa un Client ID de Google Cloud válido', 'error');
        return;
      }
      await window.db.setSetting('google_client_id', val);
      showToast('Client ID de Google guardado. Conectando con Google...', 'success');
      initGoogleOfficialGis();
      redirectToGoogleOAuth(val);
    };
  }

  // ----------------------------------------------------
  // SISTEMA DE NOTIFICACIONES DE GRUPO Y CAMPANA
  // ----------------------------------------------------

  async function getNotificationSettings() {
    const invitations = await window.db.getSetting('notify_group_invitations', true);
    const catalog = await window.db.getSetting('notify_catalog_changes', true);
    const cart = await window.db.getSetting('notify_cart_updates', true);
    const permissions = await window.db.getSetting('notify_permission_changes', true);
    return {
      notify_group_invitations: invitations !== false,
      notify_catalog_changes: catalog !== false,
      notify_cart_updates: cart !== false,
      notify_permission_changes: permissions !== false
    };
  }

  async function loadNotificationSettings() {
    const settings = await getNotificationSettings();
    const chkInv = document.getElementById('chkNotifyInvitations');
    const chkCat = document.getElementById('chkNotifyCatalog');
    const chkCart = document.getElementById('chkNotifyCart');
    const chkPerm = document.getElementById('chkNotifyPermissions');

    if (chkInv) chkInv.checked = settings.notify_group_invitations;
    if (chkCat) chkCat.checked = settings.notify_catalog_changes;
    if (chkCart) chkCart.checked = settings.notify_cart_updates;
    if (chkPerm) chkPerm.checked = settings.notify_permission_changes;
  }

  function bindNotificationSettingsEvents() {
    const bindToggle = (id, settingKey, label) => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('change', async (e) => {
          const val = e.target.checked;
          await window.db.setSetting(settingKey, val);
          showToast(`Notificaciones de "${label}" ${val ? 'activadas' : 'desactivadas'}.`, 'info');
          await updateNotificationBadge();
        });
      }
    };

    bindToggle('chkNotifyInvitations', 'notify_group_invitations', 'Invitaciones');
    bindToggle('chkNotifyCatalog', 'notify_catalog_changes', 'Catálogo');
    bindToggle('chkNotifyCart', 'notify_cart_updates', 'Carro de compras');
    bindToggle('chkNotifyPermissions', 'notify_permission_changes', 'Permisos');
  }

  async function getFilteredNotifications() {
    const all = await window.db.getNotifications();
    const settings = await getNotificationSettings();
    const currentUser = window.authGroups.getCurrentUser();
    const userEmail = currentUser ? currentUser.email.toLowerCase().trim() : null;
    const userGroups = window.authGroups.groups || [];
    const userGroupIds = new Set(userGroups.map(g => g.id));

    return all.filter(n => {
      // 1. Filtrar según preferencias de usuario configuradas en Ajustes
      if (n.type === 'INVITATION' && !settings.notify_group_invitations) return false;
      if (n.type === 'CATALOG' && !settings.notify_catalog_changes) return false;
      if (n.type === 'CART' && !settings.notify_cart_updates) return false;
      if (n.type === 'PERMISSIONS' && !settings.notify_permission_changes) return false;

      // 2. Filtrar destinatario
      const recipient = (n.recipient_email || '').toLowerCase().trim();

      // Invitaciones dirigidas al correo del usuario actual
      if (n.type === 'INVITATION') {
        if (!userEmail) return false;
        return recipient === userEmail;
      }

      // Si está dirigido a un usuario específico
      if (recipient !== 'all_group_members') {
        if (!userEmail) return false;
        return recipient === userEmail;
      }

      // Si está dirigido a todos los miembros del grupo
      if (recipient === 'all_group_members') {
        return userGroupIds.has(n.group_id);
      }

      return false;
    });
  }

  async function updateNotificationBadge() {
    const badge = document.getElementById('notifBadge');
    if (!badge) return;

    try {
      const filtered = await getFilteredNotifications();
      const unreadCount = filtered.filter(n => !n.read).length;

      if (unreadCount > 0) {
        badge.textContent = unreadCount > 9 ? '9+' : unreadCount;
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }
    } catch (err) {
      console.warn('Error al actualizar contador de notificaciones:', err);
    }
  }

  async function openNotificationsModal() {
    const list = document.getElementById('notificationsList');
    if (!list) return;

    const notifs = await getFilteredNotifications();

    if (notifs.length === 0) {
      list.innerHTML = `
        <div class="text-center py-10 px-4 text-slate-500">
          <p class="text-4xl mb-2">🔔</p>
          <p class="font-bold text-slate-200 text-sm">No tienes notificaciones pendientes</p>
          <p class="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
            Aquí recibirás invitaciones a grupos familiares, avisos de nuevos productos en el catálogo, actualizaciones del carro de compras y cambios en tus permisos.
          </p>
        </div>
      `;
    } else {
      list.innerHTML = notifs.map(n => {
        const isUnread = !n.read;
        let typeIcon = '🔔';
        let typeBadgeClass = 'bg-slate-700 text-slate-300';
        let typeLabel = 'Aviso';

        if (n.type === 'INVITATION') {
          typeIcon = '✉️';
          typeBadgeClass = 'bg-blue-500/20 text-blue-300 border border-blue-500/30';
          typeLabel = 'Invitación';
        } else if (n.type === 'CATALOG') {
          typeIcon = '📦';
          typeBadgeClass = 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
          typeLabel = 'Catálogo';
        } else if (n.type === 'CART') {
          typeIcon = '🛒';
          typeBadgeClass = 'bg-purple-500/20 text-purple-300 border border-purple-500/30';
          typeLabel = 'Carro de Compras';
        } else if (n.type === 'PERMISSIONS') {
          typeIcon = '🛡️';
          typeBadgeClass = 'bg-amber-500/20 text-amber-300 border border-amber-500/30';
          typeLabel = 'Permisos';
        }

        const timeStr = formatNotificationTime(n.created_at);

        return `
          <div class="p-3 rounded-xl border transition ${isUnread ? 'bg-slate-800/95 border-blue-500/40 shadow-sm' : 'bg-slate-900/60 border-slate-800 opacity-90'}" data-notif-id="${n.id}">
            <div class="flex items-start justify-between gap-2.5">
              <div class="flex items-start gap-2.5 min-w-0 flex-1">
                <span class="text-xl flex-shrink-0 mt-0.5">${typeIcon}</span>
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2 flex-wrap mb-0.5">
                    <span class="font-bold text-xs ${isUnread ? 'text-white' : 'text-slate-300'}">${escapeHtml(n.title)}</span>
                    <span class="px-1.5 py-0.2 rounded text-[10px] font-semibold ${typeBadgeClass}">
                      ${typeLabel}
                    </span>
                    ${isUnread ? '<span class="w-2 h-2 rounded-full bg-blue-400"></span>' : ''}
                  </div>
                  <p class="text-[11px] text-slate-300 leading-relaxed mb-2">${escapeHtml(n.message)}</p>
                  
                  <div class="flex items-center gap-3 text-[10px] text-slate-400 flex-wrap">
                    <span>🕒 ${timeStr}</span>
                    ${n.group_name ? `<span class="bg-slate-800 px-1.5 py-0.5 rounded text-slate-300">👥 Grupo: ${escapeHtml(n.group_name)}</span>` : ''}
                  </div>
                </div>
              </div>

              <!-- Acciones individuales -->
              <div class="flex flex-col items-end gap-1.5 flex-shrink-0">
                ${renderNotificationActionButton(n)}
                <button class="btn-delete-single-notif text-[11px] text-slate-500 hover:text-red-400 p-1" data-id="${n.id}" title="Eliminar notificación">
                  ✕
                </button>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }

    // Enlazar eventos de acciones dentro del modal
    bindNotificationModalActions();

    openModal('modalNotifications');
  }

  function renderNotificationActionButton(n) {
    if (n.type === 'INVITATION') {
      return `
        <button class="btn btn-primary btn-sm text-[10px] py-1 px-2.5 font-bold btn-notif-action-join" data-group-id="${n.group_id}" data-id="${n.id}">
          ✨ Ir al Grupo
        </button>
      `;
    }
    if (n.type === 'CART') {
      return `
        <button class="btn btn-secondary btn-sm text-[10px] py-1 px-2 btn-notif-action-cart" data-group-id="${n.group_id}" data-id="${n.id}">
          🛒 Ver Canasta
        </button>
      `;
    }
    if (n.type === 'CATALOG') {
      return `
        <button class="btn btn-secondary btn-sm text-[10px] py-1 px-2 btn-notif-action-catalog" data-group-id="${n.group_id}" data-id="${n.id}">
          📦 Ver Catálogo
        </button>
      `;
    }
    if (n.type === 'PERMISSIONS') {
      return `
        <button class="btn btn-secondary btn-sm text-[10px] py-1 px-2 btn-notif-action-perms" data-group-id="${n.group_id}" data-id="${n.id}">
          🛡️ Ver Permisos
        </button>
      `;
    }
    return '';
  }

  function bindNotificationModalActions() {
    const list = document.getElementById('notificationsList');
    if (!list) return;

    // Acción para unirse o ir al grupo
    list.querySelectorAll('.btn-notif-action-join').forEach(btn => {
      btn.addEventListener('click', async () => {
        const groupId = btn.dataset.groupId;
        const notifId = btn.dataset.id;
        await window.db.markNotificationAsRead(notifId);
        closeModal('modalNotifications');
        try {
          await window.authGroups.switchToGroup(groupId);
          showToast('¡Has accedido al grupo compartido!', 'success');
        } catch (err) {
          showToast(err.message, 'error');
        }
        updateNotificationBadge();
      });
    });

    // Acción para ver el carro de compras
    list.querySelectorAll('.btn-notif-action-cart').forEach(btn => {
      btn.addEventListener('click', async () => {
        const groupId = btn.dataset.groupId;
        const notifId = btn.dataset.id;
        await window.db.markNotificationAsRead(notifId);
        closeModal('modalNotifications');
        try {
          if (groupId && window.authGroups.getActiveWorkspaceId() !== groupId) {
            await window.authGroups.switchToGroup(groupId);
          }
          switchView('planner');
        } catch (err) {
          console.error(err);
        }
        updateNotificationBadge();
      });
    });

    // Acción para ver productos / catálogo
    list.querySelectorAll('.btn-notif-action-catalog').forEach(btn => {
      btn.addEventListener('click', async () => {
        const groupId = btn.dataset.groupId;
        const notifId = btn.dataset.id;
        await window.db.markNotificationAsRead(notifId);
        closeModal('modalNotifications');
        try {
          if (groupId && window.authGroups.getActiveWorkspaceId() !== groupId) {
            await window.authGroups.switchToGroup(groupId);
          }
          switchView('products');
        } catch (err) {
          console.error(err);
        }
        updateNotificationBadge();
      });
    });

    // Acción para ver permisos
    list.querySelectorAll('.btn-notif-action-perms').forEach(btn => {
      btn.addEventListener('click', async () => {
        const groupId = btn.dataset.groupId;
        const notifId = btn.dataset.id;
        await window.db.markNotificationAsRead(notifId);
        closeModal('modalNotifications');
        try {
          if (groupId && window.authGroups.getActiveWorkspaceId() !== groupId) {
            await window.authGroups.switchToGroup(groupId);
          }
          openGroupManagement();
        } catch (err) {
          console.error(err);
        }
        updateNotificationBadge();
      });
    });

    // Eliminar notificación individual
    list.querySelectorAll('.btn-delete-single-notif').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        await window.db.deleteNotification(id);
        openNotificationsModal();
        updateNotificationBadge();
      });
    });
  }

  function formatNotificationTime(isoDate) {
    if (!isoDate) return '';
    try {
      const d = new Date(isoDate);
      const now = new Date();
      const diffSecs = Math.floor((now - d) / 1000);
      if (diffSecs < 60) return 'Hace un momento';
      const diffMins = Math.floor(diffSecs / 60);
      if (diffMins < 60) return `Hace ${diffMins} min`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `Hace ${diffHours} h`;
      return d.toLocaleDateString('es-VE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  }

  // Botón campana de notificaciones
  const bellBtn = document.getElementById('btnNotificationsBell');
  if (bellBtn) {
    bellBtn.addEventListener('click', () => {
      openNotificationsModal();
    });
  }

  // Leer todas las notificaciones
  const markAllBtn = document.getElementById('btnMarkAllNotifsRead');
  if (markAllBtn) {
    markAllBtn.addEventListener('click', async () => {
      await window.db.markAllNotificationsAsRead();
      showToast('Todas las notificaciones han sido marcadas como leídas', 'success');
      openNotificationsModal();
      updateNotificationBadge();
    });
  }

  // Limpiar todas las notificaciones
  const clearNotifsBtn = document.getElementById('btnClearAllNotifs');
  if (clearNotifsBtn) {
    clearNotifsBtn.addEventListener('click', async () => {
      if (confirm('¿Deseas eliminar todas las notificaciones?')) {
        await window.db.clearAllNotifications();
        showToast('Notificaciones vaciadas', 'info');
        openNotificationsModal();
        updateNotificationBadge();
      }
    });
  }

  // Inicializar Preferencias y Badge de Notificaciones
  loadNotificationSettings();
  bindNotificationSettingsEvents();
  updateNotificationBadge();

  // ----------------------------------------------------
  // REGISTRO DE SERVICE WORKER (PWA)
  // ----------------------------------------------------
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js?v=28').then((reg) => {
      console.log('Service Worker registrado con éxito:', reg.scope);
      reg.update();
    }).catch((err) => {
      console.warn('Registro de Service Worker falló:', err);
    });
  }

  // Helper para normalizar y limpiar atributos en productos previamente guardados
  async function migrateExistingProductAttributes() {
    try {
      if (!window.ProductUtils || !window.db || typeof window.db.getAll !== 'function') return;
      const allProds = await window.db.getAll('products');
      if (!allProds || allProds.length === 0) return;

      let updatedCount = 0;
      for (const prod of allProds) {
        if (!prod || !prod.name) continue;
        const sanitized = window.ProductUtils.sanitizeProductAttributes(
          prod.name,
          prod.weight,
          prod.volume,
          prod.quantity
        );
        let changed = false;
        if (sanitized.name && sanitized.name !== prod.name) {
          prod.name = sanitized.name;
          changed = true;
        }
        if (sanitized.weight && prod.weight !== sanitized.weight) {
          prod.weight = sanitized.weight;
          changed = true;
        }
        if (sanitized.volume && prod.volume !== sanitized.volume) {
          prod.volume = sanitized.volume;
          changed = true;
        }
        if (sanitized.quantity && prod.quantity !== sanitized.quantity) {
          prod.quantity = sanitized.quantity;
          changed = true;
        }
        if (changed) {
          await window.db.put('products', prod);
          updatedCount++;
        }
      }
      if (updatedCount > 0) {
        console.log(`[ProductUtils] Migración automática: ${updatedCount} productos normalizados con peso/volumen/cantidad.`);
      }
    } catch (err) {
      console.warn('Error en migrateExistingProductAttributes:', err);
    }
  }

  // Helper para escapar HTML en strings dinámicos
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Inicializar estado de API Key y Nivel de Modelo al cargar
  updateApiKeyUI();
  updateModelTierUI();

  // Soporte para accesos directos de Shortcut Manager / PWA Shortcuts
  const urlParams = new URLSearchParams(window.location.search);
  const actionParam = urlParams.get('action');

  if (actionParam === 'scan') {
    switchView('scanner');
  } else if (actionParam === 'planner') {
    switchView('planner');
  } else if (actionParam === 'expense') {
    switchView('accounting');
    setTimeout(() => {
      document.getElementById('formExpense').reset();
      document.getElementById('inputExpenseDate').value = new Date().toISOString().split('T')[0];
      openModal('modalExpense');
    }, 200);
  } else {
    // Carga inicial de la primera vista
    switchView('stores');
  }
});
