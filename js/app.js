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

  // Sembrar datos de demostración si la base de datos está vacía
  await window.db.seedInitialDataIfEmpty(window.bcvService.rate);

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

  // Variables de Estado en Memoria
  let currentActiveView = 'stores';
  let activeCompressedPhoto = null;
  let activeExtractionData = null;
  let activeScanMode = 'FACTURA';
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
    if (viewName === 'accounting') renderAccounting();
    if (viewName === 'invoices') renderInvoicesArchive();
    if (viewName === 'settings') loadSettingsForm();

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

  // Cerrar sesión
  document.getElementById('btnSignOutGoogle').addEventListener('click', async () => {
    await window.authGroups.signOut();
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

    // Listar miembros
    const membersList = document.getElementById('groupMembersList');
    membersList.innerHTML = (activeWs.members || []).map(m => {
      const isAdmin = m.toLowerCase() === activeWs.owner_email.toLowerCase();
      const canRemove = isOwner && !isAdmin;
      return `
        <div class="flex items-center justify-between p-2 rounded-lg bg-slate-800/60 border border-slate-700/60 text-xs">
          <div class="flex items-center gap-2">
            <span>👤</span>
            <span class="font-medium text-slate-200">${escapeHtml(m)}</span>
            <span class="px-1.5 py-0.5 rounded text-[10px] font-bold ${isAdmin ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-700 text-slate-300'}">
              ${isAdmin ? '👑 Admin' : 'Miembro'}
            </span>
          </div>
          ${canRemove ? `
            <button class="btn btn-outline-danger btn-sm text-[10px] py-0.5 px-2 btn-remove-member" data-email="${escapeHtml(m)}">
              Expulsar
            </button>
          ` : ''}
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

    openModal('modalManageGroup');
  }

  document.getElementById('btnOpenManageGroupModal').addEventListener('click', () => {
    wsDropdown.classList.add('hidden');
    openGroupManagement();
  });
  document.getElementById('btnBannerManageGroup').addEventListener('click', openGroupManagement);

  // Formulario para invitar miembro por correo
  document.getElementById('formInviteMember').addEventListener('submit', async (e) => {
    e.preventDefault();
    const activeWs = window.authGroups.getActiveWorkspace();
    const emailToInvite = document.getElementById('inputInviteMemberEmail').value;

    try {
      await window.authGroups.inviteMember(activeWs.id, emailToInvite);
      showToast(`¡Invitación registrada! ${emailToInvite} podrá unirse al iniciar sesión con Google.`, 'success');
      document.getElementById('inputInviteMemberEmail').value = '';
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
    if (currentActiveView === 'stores') renderStores();
    if (currentActiveView === 'products') renderProducts();
    if (currentActiveView === 'planner') loadPlannerProductList();
  });
  updateWorkspaceUI();
  updateGoogleAuthUI();

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
    // Si la vista actual muestra precios convertidos, refrescar
    if (currentActiveView === 'products') renderProducts();
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
      let priceUsd = p.current_price;
      let priceVes = p.current_price;
      if (p.original_currency === 'VES') {
        priceUsd = currentRate > 0 ? p.current_price / currentRate : 0;
      } else {
        priceVes = p.current_price * currentRate;
      }

      const mediaHtml = window.AppIcons ? window.AppIcons.renderProductMedia(p, 'w-10 h-10') : '🏷️';

      const starsHtml = [1, 2, 3, 4, 5].map(starNum => {
        const isFilled = p.rating && p.rating >= starNum;
        return `<span class="star ${isFilled ? 'filled' : ''}" data-prod-id="${p.id}" data-rating="${starNum}" title="Calificar con ${starNum} estrellas">★</span>`;
      }).join('');

      return `
        <div class="p-3 bg-slate-900/80 rounded-xl border border-slate-800 flex items-center justify-between gap-3 hover:border-slate-700 transition">
          <div class="flex items-center gap-3 min-w-0">
            ${mediaHtml}
            <div class="truncate">
              <h4 class="font-bold text-slate-100 text-xs truncate">${escapeHtml(p.name)}</h4>
              <div class="flex items-center gap-2 mt-0.5">
                <span class="text-xs font-black text-slate-200">$ ${priceUsd.toFixed(2)}</span>
                <span class="text-[10px] text-emerald-400 font-semibold">Bs. ${priceVes.toFixed(2)}</span>
              </div>
            </div>
          </div>

          <div class="flex items-center gap-2 flex-shrink-0">
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
          window.activePriceChart.setData(prod, history);
          openModal('modalPriceChart');
        }
      });
    });
  }

  document.getElementById('storeModalFilterInput').addEventListener('input', renderStoreModalProductsList);

  document.getElementById('btnStoreModalAddProduct').addEventListener('click', async () => {
    if (!currentModalStoreId) return;
    await populateStoreSelect('inputProductStoreId', currentModalStoreId);
    document.getElementById('modalProductTitle').textContent = 'Nuevo Producto';
    document.getElementById('formProduct').reset();
    document.getElementById('inputProductId').value = '';
    setProductMedia('icon', 'grain');
    setModalRatingStars(0);
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
            <div class="card-header items-center gap-3">
              <div class="flex items-center gap-3 min-w-0">
                ${mediaHtml}
                <div class="min-w-0">
                  <h3 class="card-title text-base group-hover:text-blue-400 transition truncate">${escapeHtml(store.name)}</h3>
                  <span class="card-badge mt-1">${storeProducts.length} productos</span>
                </div>
              </div>
            </div>
            <p class="card-desc mt-2">${escapeHtml(store.description || 'Sin descripción adicional')}</p>
            <div class="text-[11px] text-blue-400 font-semibold mt-2.5 flex items-center gap-1 opacity-90 group-hover:opacity-100">
              <span>👉 Toca para ver sus ${storeProducts.length} productos</span>
            </div>
          </div>
          
          <div class="card-footer mt-3" onclick="event.stopPropagation();">
            <div class="flex items-center gap-1.5 flex-wrap">
              <a href="${mapsLink}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-sm text-blue-400" onclick="event.stopPropagation();">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                Maps
              </a>
              ${isGroup ? `
                <button class="btn btn-primary btn-sm btn-copy-store-personal" data-id="${store.id}" title="Copiar tienda y sus productos a mi espacio personal" onclick="event.stopPropagation();">
                  📥 A Personal
                </button>
              ` : ''}
            </div>
            <div class="flex items-center gap-1.5" onclick="event.stopPropagation();">
              <button class="btn btn-secondary btn-sm btn-edit-store" data-id="${store.id}" title="Editar tienda" onclick="event.stopPropagation();">
                ✏️
              </button>
              <button class="btn btn-outline-danger btn-sm btn-delete-store" data-id="${store.id}" title="Eliminar tienda" onclick="event.stopPropagation();">
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
    document.getElementById('modalStoreTitle').textContent = 'Nueva Tienda';
    document.getElementById('formStore').reset();
    document.getElementById('inputStoreId').value = '';
    setStoreMedia('icon', 'supermarket');
    openModal('modalStore');
  });

  document.getElementById('formStore').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('inputStoreId').value;
    const name = document.getElementById('inputStoreName').value.trim();
    let mapsUrl = document.getElementById('inputStoreMapsUrl').value.trim();
    const lat = parseFloat(document.getElementById('inputStoreLat').value) || null;
    const lng = parseFloat(document.getElementById('inputStoreLng').value) || null;
    const desc = document.getElementById('inputStoreDesc').value.trim();
    const imageType = document.getElementById('inputStoreImageType').value || 'icon';
    const imageData = document.getElementById('inputStoreImageData').value || 'supermarket';

    if (!mapsUrl) {
      mapsUrl = `https://maps.google.com/?q=${encodeURIComponent(name)}`;
    }

    await window.db.saveStore({
      id: id ? parseInt(id) : undefined,
      name,
      maps_url: mapsUrl,
      lat,
      lng,
      description: desc,
      image_type: imageType,
      image_data: imageData
    });

    showToast('Tienda guardada con éxito', 'success');
    closeModal('modalStore');
    renderStores();
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

      // Conversión dual dinámica (USD y VES)
      let priceUsd = prod.current_price;
      let priceVes = prod.current_price;

      if (prod.original_currency === 'VES') {
        priceUsd = currentRate > 0 ? prod.current_price / currentRate : 0;
      } else {
        priceVes = prod.current_price * currentRate;
      }

      const mediaHtml = window.AppIcons ? window.AppIcons.renderProductMedia(prod) : '🏷️';

      // Estrellas de valoración personal compartida (1 a 5)
      const starsHtml = [1, 2, 3, 4, 5].map(starNum => {
        const isFilled = prod.rating && prod.rating >= starNum;
        return `<span class="star ${isFilled ? 'filled' : ''}" data-prod-id="${prod.id}" data-rating="${starNum}" title="Calificar con ${starNum} estrellas">★</span>`;
      }).join('');

      return `
        <div class="app-card">
          <div>
            <div class="card-header items-center gap-3">
              <div class="flex items-center gap-3 min-w-0">
                ${mediaHtml}
                <div class="min-w-0">
                  <span class="text-[11px] font-semibold text-blue-400 block truncate">${escapeHtml(store.name)}</span>
                  <h3 class="card-title text-base mt-0.5 truncate">${escapeHtml(prod.name)}</h3>
                </div>
              </div>
              <!-- Dual Price Badge -->
              <div class="text-right flex-shrink-0">
                <span class="text-base font-extrabold text-slate-100 block">$ ${priceUsd.toFixed(2)}</span>
                <span class="text-[11px] font-semibold text-emerald-400">Bs. ${priceVes.toFixed(2)}</span>
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
            <div class="flex items-center gap-1.5 flex-wrap">
              <button class="btn btn-secondary btn-sm btn-view-chart" data-id="${prod.id}" title="Ver historial de precios y gráfica porcentual">
                📈 Gráfica & %
              </button>
              ${isGroup ? `
                <button class="btn btn-primary btn-sm btn-copy-prod-personal" data-id="${prod.id}" title="Copiar producto a mi espacio personal">
                  📥 A Personal
                </button>
              ` : ''}
            </div>
            <div class="flex items-center gap-1.5">
              <button class="btn btn-secondary btn-sm btn-edit-product" data-id="${prod.id}">✏️</button>
              <button class="btn btn-outline-danger btn-sm btn-delete-product" data-id="${prod.id}">🗑️</button>
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

          window.activePriceChart.setData(prod, history);
          openModal('modalPriceChart');
        }
      });
    });

    // Edit Product
    document.querySelectorAll('.btn-edit-product').forEach(btn => {
      btn.addEventListener('click', async () => {
        const prod = await window.db.getById('products', parseInt(btn.dataset.id));
        if (prod) {
          await populateStoreSelect('inputProductStoreId', prod.store_id);
          document.getElementById('modalProductTitle').textContent = 'Editar Producto';
          document.getElementById('inputProductId').value = prod.id;
          document.getElementById('inputProductName').value = prod.name;
          document.getElementById('inputProductPrice').value = prod.current_price;
          document.getElementById('inputProductCurrency').value = prod.original_currency || 'USD';
          document.getElementById('inputProductDesc').value = prod.description || '';
          setProductMedia(prod.image_type || 'icon', prod.image_data || 'grain');
          setModalRatingStars(prod.rating || 0);
          openModal('modalProduct');
        }
      });
    });

    // Delete Product
    document.querySelectorAll('.btn-delete-product').forEach(btn => {
      btn.addEventListener('click', async () => {
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
      setModalRatingStars(parseInt(star.dataset.val));
    });
  });

  document.getElementById('btnClearProductRating').addEventListener('click', () => {
    setModalRatingStars(0);
  });

  async function populateStoreSelect(selectId, selectedId = null) {
    const select = document.getElementById(selectId);
    const stores = await window.db.getStores();
    select.innerHTML = stores.map(s => `
      <option value="${s.id}" ${selectedId == s.id ? 'selected' : ''}>${escapeHtml(s.name)}</option>
    `).join('');
  }

  document.getElementById('btnNewProduct').addEventListener('click', async () => {
    const stores = await window.db.getStores();
    if (stores.length === 0) {
      showToast('Debes crear al menos una tienda antes de registrar productos', 'error');
      openModal('modalStore');
      return;
    }
    await populateStoreSelect('inputProductStoreId');
    document.getElementById('modalProductTitle').textContent = 'Nuevo Producto';
    document.getElementById('formProduct').reset();
    document.getElementById('inputProductId').value = '';
    setProductMedia('icon', 'grain');
    setModalRatingStars(0);
    openModal('modalProduct');
  });

  document.getElementById('formProduct').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('inputProductId').value;
    const storeId = parseInt(document.getElementById('inputProductStoreId').value);
    const name = document.getElementById('inputProductName').value.trim();
    const price = parseFloat(document.getElementById('inputProductPrice').value);
    const currency = document.getElementById('inputProductCurrency').value;
    const ratingVal = parseInt(document.getElementById('inputProductRating').value) || null;
    const desc = document.getElementById('inputProductDesc').value.trim();
    const imageType = document.getElementById('inputProductImageType').value || 'icon';
    const imageData = document.getElementById('inputProductImageData').value || 'grain';

    const saved = await window.db.saveProduct({
      id: id ? parseInt(id) : undefined,
      store_id: storeId,
      name,
      current_price: price,
      original_currency: currency,
      rating: ratingVal,
      description: desc,
      image_type: imageType,
      image_data: imageData
    }, 'MANUAL', window.bcvService.rate);

    // Si se especificó calificación, sincronizarla automáticamente con productos idénticos
    if (ratingVal && saved && saved.id) {
      await window.db.updateProductRatingShared(saved.id, ratingVal);
    }

    showToast('Producto guardado con éxito', 'success');
    closeModal('modalProduct');
    renderProducts();
  });

  // ----------------------------------------------------
  // 3. ESCANEO CON IA & COMPRESIÓN EXTREMA
  // ----------------------------------------------------
  const scanModeInvoiceBtn = document.getElementById('scanModeInvoiceBtn');
  const scanModeTableBtn = document.getElementById('scanModeTableBtn');

  scanModeInvoiceBtn.addEventListener('click', () => {
    activeScanMode = 'FACTURA';
    scanModeInvoiceBtn.className = 'p-3 rounded-xl border border-blue-500 bg-blue-500/10 text-blue-400 font-semibold text-sm flex items-center justify-center gap-2';
    scanModeTableBtn.className = 'p-3 rounded-xl border border-slate-700 bg-slate-800 text-slate-400 font-semibold text-sm flex items-center justify-center gap-2';
  });

  scanModeTableBtn.addEventListener('click', () => {
    activeScanMode = 'TABLA_PRECIOS';
    scanModeTableBtn.className = 'p-3 rounded-xl border border-blue-500 bg-blue-500/10 text-blue-400 font-semibold text-sm flex items-center justify-center gap-2';
    scanModeInvoiceBtn.className = 'p-3 rounded-xl border border-slate-700 bg-slate-800 text-slate-400 font-semibold text-sm flex items-center justify-center gap-2';
  });

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

  // Procesar con IA
  document.getElementById('btnProcessAI').addEventListener('click', async () => {
    if (!activeCompressedPhoto) {
      showToast('Primero toma o sube una foto', 'error');
      return;
    }

    const apiKey = await window.aiScanner.getApiKey();
    if (!apiKey) {
      const enteredKey = prompt(
        'Ingresa tu clave gratuita de Google Gemini (AI Studio).\nPuedes obtenerla gratis en aistudio.google.com/app/apikey:'
      );
      if (enteredKey && enteredKey.trim().length > 10) {
        await window.aiScanner.setApiKey(enteredKey.trim());
      } else {
        showToast('Se requiere una clave API para analizar con IA.', 'error');
        return;
      }
    }

    const processBtn = document.getElementById('btnProcessAI');
    processBtn.disabled = true;
    processBtn.innerHTML = '⏳ Analizando con Gemini Flash...';

    try {
      const result = await window.aiScanner.analyzeImage(activeCompressedPhoto.dataUrl, activeScanMode);
      activeExtractionData = result;

      // Mostrar resultados para confirmación
      document.getElementById('extractedStoreName').textContent = result.store_name || 'Tienda Desconocida';
      const currSymbol = result.currency === 'VES' ? 'Bs.' : '$';
      document.getElementById('extractedTotalAmount').textContent = `${currSymbol} ${(parseFloat(result.total) || 0).toFixed(2)}`;

      const tbody = document.getElementById('extractedItemsTableBody');
      tbody.innerHTML = (result.items || []).map(item => `
        <tr class="hover:bg-slate-800/50">
          <td class="p-2.5 font-medium text-slate-200">${escapeHtml(item.name)}</td>
          <td class="p-2.5 text-center text-slate-400">${item.quantity || 1}</td>
          <td class="p-2.5 text-right font-semibold text-slate-100">${currSymbol} ${(parseFloat(item.price) || 0).toFixed(2)}</td>
          <td class="p-2.5 text-right font-bold text-emerald-400">${currSymbol} ${(parseFloat(item.total) || ((item.price || 0) * (item.quantity || 1))).toFixed(2)}</td>
        </tr>
      `).join('');

      document.getElementById('scanResultBox').classList.remove('hidden');
      showToast('Extracción completada con éxito. Revisa y confirma.', 'success');
    } catch (err) {
      console.error(err);
      showToast('Error al analizar con IA: ' + err.message, 'error');
    } finally {
      processBtn.disabled = false;
      processBtn.innerHTML = '✨ Analizar Factura con Gemini Flash';
    }
  });

  // Confirmar y Guardar en BD
  document.getElementById('btnConfirmScan').addEventListener('click', async () => {
    if (!activeExtractionData) return;

    try {
      const commitRes = await window.aiScanner.processAndCommitExtraction(activeExtractionData, activeCompressedPhoto);

      showToast(
        `¡Guardado! ${commitRes.newProductsCount} productos nuevos, ${commitRes.updatedProductsCount} actualizados.`,
        'success'
      );

      // Limpiar estado
      activeExtractionData = null;
      activeCompressedPhoto = null;
      document.getElementById('scanPreviewCard').classList.add('hidden');
      document.getElementById('scanResultBox').classList.add('hidden');
      document.getElementById('cameraFileInput').value = '';
      document.getElementById('galleryFileInput').value = '';

      // Redirigir a productos o contabilidad
      switchView('products');
    } catch (err) {
      console.error(err);
      showToast('Error al registrar en la base de datos: ' + err.message, 'error');
    }
  });

  document.getElementById('btnDiscardScan').addEventListener('click', () => {
    activeExtractionData = null;
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
      catalogContainer.innerHTML = filtered.map(name => {
        const prod = productsByName.get(name);
        const mediaHtml = window.AppIcons ? window.AppIcons.renderProductMedia(prod, 'w-8 h-8') : '🏷️';
        const inCartQty = plannerCart.get(name) || 0;

        return `
          <div class="flex items-center justify-between p-2 rounded-xl bg-slate-800/40 hover:bg-slate-800 border border-slate-800/60 transition gap-2">
            <div class="flex items-center gap-2.5 min-w-0">
              ${mediaHtml}
              <div class="truncate">
                <span class="text-xs font-semibold text-slate-200 block truncate">${escapeHtml(name)}</span>
                <span class="text-[10px] text-slate-400 block">${inCartQty > 0 ? `<span class="text-emerald-400 font-bold">${inCartQty} en canasta</span>` : 'Disponible'}</span>
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
      return;
    }

    if (clearBtn) clearBtn.classList.remove('hidden');

    let totalUnits = 0;
    plannerCart.forEach(qty => totalUnits += qty);
    if (summaryEl) {
      summaryEl.textContent = `${totalUnits} unidad${totalUnits === 1 ? '' : 'es'} (${plannerCart.size} producto${plannerCart.size === 1 ? '' : 's'})`;
    }

    const cartEntries = Array.from(plannerCart.entries());
    cartContainer.innerHTML = cartEntries.map(([name, qty]) => {
      const prod = productsByName.get(name) || { name };
      const mediaHtml = window.AppIcons ? window.AppIcons.renderProductMedia(prod, 'w-8 h-8') : '🛒';

      return `
        <div class="flex items-center justify-between p-2 rounded-xl bg-slate-800/80 border border-slate-700/70 gap-2">
          <div class="flex items-center gap-2.5 min-w-0">
            ${mediaHtml}
            <span class="text-xs font-bold text-slate-100 truncate">${escapeHtml(name)}</span>
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
        const name = btn.dataset.name;
        const current = plannerCart.get(name) || 0;
        plannerCart.set(name, current + 1);
        renderPlannerCart();
        loadPlannerProductList();
      });
    });

    cartContainer.querySelectorAll('.btn-cart-minus').forEach(btn => {
      btn.addEventListener('click', () => {
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

  document.getElementById('btnClearPlannerCart').addEventListener('click', () => {
    plannerCart.clear();
    renderPlannerCart();
    loadPlannerProductList();
    showToast('Canasta vaciada', 'info');
  });

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

    // 1. Tarjeta La Más Barata
    const cardCheapest = document.getElementById('cardBestCheapest');
    if (plan.bestCheapest) {
      cardCheapest.querySelector('.store-name').textContent = plan.bestCheapest.store.name;
      cardCheapest.querySelector('.store-summary').textContent = `${plan.bestCheapest.available.length}/${totalSelectedCount} productos disponibles`;
      cardCheapest.querySelector('.store-price').textContent = `$ ${plan.bestCheapest.totalCostUSD.toFixed(2)}`;
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
        <span class="text-[10px] bg-red-500/10 text-red-400 border border-red-500/20 px-1.5 py-0.5 rounded">Falta: ${escapeHtml(m)}</span>
      `).join(' ');

      const availableItemsSummary = r.available.map(a => `
        <span class="text-[10px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded border border-slate-700">
          ${escapeHtml(a.product.name)} (x${a.qty || 1}): $${((a.product.current_price || 0) * (a.qty || 1)).toFixed(2)}
        </span>
      `).join(' ');

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
                <span class="text-sm font-extrabold text-emerald-400 block">$ ${r.totalCostUSD.toFixed(2)}</span>
                <span class="text-[10px] text-slate-400">Bs. ${r.totalCostVES.toFixed(2)}</span>
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
        <div class="flex items-center justify-between p-3 rounded-xl bg-slate-800/40 border border-slate-800 text-xs hover:border-slate-700 transition">
          <div class="flex items-center gap-3">
            <span class="w-8 h-8 rounded-lg flex items-center justify-center ${isInvoice ? 'bg-blue-500/10 text-blue-400' : 'bg-emerald-500/10 text-emerald-400'} font-bold">
              ${isInvoice ? '🧾' : '✍️'}
            </span>
            <div>
              <span class="font-bold text-slate-100 block">${escapeHtml(exp.concept)}</span>
              <span class="text-[11px] text-slate-400">${exp.date} • <span class="text-slate-300 font-semibold">${escapeHtml(exp.category || 'Otros')}</span></span>
            </div>
          </div>
          <div class="text-right">
            <span class="text-sm font-bold text-slate-100 block">$ ${parseFloat(exp.amount_usd || 0).toFixed(2)}</span>
            <span class="text-[10px] text-emerald-400 font-medium">Bs. ${parseFloat(exp.amount_ves || 0).toFixed(2)}</span>
          </div>
        </div>
      `;
    }).join('');
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
    document.getElementById('inputExpenseDate').value = new Date().toISOString().split('T')[0];
    openModal('modalExpense');
  });

  document.getElementById('formExpense').addEventListener('submit', async (e) => {
    e.preventDefault();
    const concept = document.getElementById('inputExpenseConcept').value.trim();
    const amount = parseFloat(document.getElementById('inputExpenseAmount').value);
    const currency = document.getElementById('inputExpenseCurrency').value;
    const category = document.getElementById('inputExpenseCategory').value;
    const date = document.getElementById('inputExpenseDate').value;
    const note = document.getElementById('inputExpenseNote').value.trim();

    await window.accountingService.addManualExpense({
      concept,
      amount,
      currency,
      category,
      date,
      note
    });

    showToast('Gasto manual registrado con éxito', 'success');
    closeModal('modalExpense');
    renderAccounting();
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
    driveToggle.checked = syncEnabled;
    updateDriveStatusUI(syncEnabled);
  }

  function updateDriveStatusUI(enabled) {
    const statusDesc = document.getElementById('driveStatusDesc');
    const pill = document.getElementById('drivePillBtn');
    const pillText = document.getElementById('drivePillText');

    if (enabled) {
      statusDesc.textContent = 'Activada: Se sincroniza automáticamente';
      pill.classList.remove('disabled');
      pillText.textContent = 'Drive: Activo';
    } else {
      statusDesc.textContent = 'Desactivada por el usuario';
      pill.classList.add('disabled');
      pillText.textContent = 'Drive';
    }
  }

  document.getElementById('btnSaveGeminiKey').addEventListener('click', async () => {
    const key = document.getElementById('inputGeminiApiKey').value.trim();
    await window.aiScanner.setApiKey(key);
    showToast('Clave de Gemini guardada correctamente', 'success');
  });

  document.getElementById('toggleDriveSync').addEventListener('change', async (e) => {
    const enabled = e.target.checked;
    await window.backupDrive.toggleDriveSync(enabled);
    updateDriveStatusUI(enabled);
    showToast(enabled ? 'Sincronización en la nube activada' : 'Sincronización desactivada', 'info');
  });

  document.getElementById('btnManualDriveSync').addEventListener('click', async () => {
    try {
      showToast('Sincronizando con Google Drive...', 'info');
      await window.backupDrive.syncToGoogleDrive();
      showToast('¡Base de datos sincronizada exitosamente con la nube!', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

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
    if (!clientId) {
      showToast('Se requiere un Client ID de Google Cloud para abrir accounts.google.com', 'error');
      const notice = document.getElementById('googleClientSetupNotice');
      if (notice) notice.classList.remove('hidden');
      const input = document.getElementById('inputGoogleClientId');
      if (input) input.focus();
      return;
    }

    const redirectUri = window.location.origin + window.location.pathname;
    const state = 'google_oauth_' + Math.random().toString(36).substring(2, 12);
    try {
      sessionStorage.setItem('oauth_state', state);
    } catch (e) {}

    const scope = encodeURIComponent('email profile openid');
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${encodeURIComponent(clientId)}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `response_type=token&` +
      `scope=${scope}&` +
      `state=${encodeURIComponent(state)}&` +
      `prompt=select_account`;

    showToast('Abriendo ventana oficial de Google...', 'info');
    setTimeout(() => {
      window.location.href = authUrl;
    }, 250);
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

  // Client ID de Google OAuth 2.0 fijado para la aplicación
  // Al integrarse aquí, ningún usuario final ve solicitudes de credenciales técnicas
  const GOOGLE_CLIENT_ID_CONFIG = '';

  async function getAppGoogleClientId() {
    if (GOOGLE_CLIENT_ID_CONFIG && GOOGLE_CLIENT_ID_CONFIG.trim()) {
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
      btnDirect.onclick = async () => {
        const clientId = await getAppGoogleClientId();
        if (clientId) {
          redirectToGoogleOAuth(clientId);
        } else {
          showToast('Google requiere vincular el proyecto con Google Cloud (Ver instrucciones del desarrollador)', 'info');
        }
      };
    }

    if (!container) return;

    if (!savedClientId) {
      container.innerHTML = '';
      return;
    }

    if (setupCard) setupCard.classList.add('hidden');

    function renderGis() {
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
        } catch (err) {
          console.warn('GIS renderButton error:', err);
        }
      } else {
        setTimeout(renderGis, 300);
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
  // REGISTRO DE SERVICE WORKER (PWA)
  // ----------------------------------------------------
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js?v=7').then((reg) => {
      console.log('Service Worker registrado con éxito:', reg.scope);
      reg.update();
    }).catch((err) => {
      console.warn('Registro de Service Worker falló:', err);
    });
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
