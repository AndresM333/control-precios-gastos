// Módulo de Autenticación con Google, Grupos Compartidos y Copia a Espacio Personal
class AuthGroupsService {
  constructor() {
    this.currentUser = null;
    this.activeWorkspace = {
      type: 'PERSONAL',
      id: 'personal',
      name: 'Mi Espacio Personal'
    };
    this.groups = [];
    this.listeners = [];
  }

  async init() {
    // 1. Cargar usuario guardado
    const savedUser = await window.db.getSetting('logged_in_user');
    if (savedUser) {
      this.currentUser = savedUser;
    }

    // 2. Cargar espacio de trabajo activo
    const savedWs = await window.db.getSetting('active_workspace');
    if (savedWs) {
      this.activeWorkspace = savedWs;
    }

    // 3. Cargar grupos accesibles
    await this.refreshUserGroups();

    // Si el espacio activo era un grupo al que ya no pertenece, volver a personal
    if (this.activeWorkspace.type === 'GROUP') {
      const stillHasAccess = this.groups.some(g => g.id === this.activeWorkspace.id);
      if (!stillHasAccess) {
        this.activeWorkspace = { type: 'PERSONAL', id: 'personal', name: 'Mi Espacio Personal' };
        await window.db.setSetting('active_workspace', this.activeWorkspace);
      }
    }
  }

  // --- Manejo de Autenticación con Google ---

  /**
   * Inicia sesión con cuenta de Google
   */
  async signInWithGoogle(email, displayName = null, photoURL = null) {
    if (!email || !email.includes('@')) {
      throw new Error('Correo electrónico inválido.');
    }

    const cleanEmail = email.trim().toLowerCase();
    const name = displayName || cleanEmail.split('@')[0];

    this.currentUser = {
      uid: 'goog_' + btoa(cleanEmail).replace(/=/g, ''),
      email: cleanEmail,
      displayName: name,
      photoURL: photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=3b82f6&color=fff`,
      signedInAt: new Date().toISOString()
    };

    await window.db.setSetting('logged_in_user', this.currentUser);
    await this.refreshUserGroups();
    this.notify();
    return this.currentUser;
  }

  async signOut() {
    this.currentUser = null;
    this.activeWorkspace = { type: 'PERSONAL', id: 'personal', name: 'Mi Espacio Personal' };
    this.groups = [];

    await window.db.setSetting('logged_in_user', null);
    await window.db.setSetting('active_workspace', this.activeWorkspace);
    this.notify();
  }

  isLoggedIn() {
    return !!this.currentUser;
  }

  getCurrentUser() {
    return this.currentUser;
  }

  // --- Espacios de Trabajo (Workspaces) ---

  getActiveWorkspace() {
    return this.activeWorkspace;
  }

  getActiveWorkspaceId() {
    return this.activeWorkspace ? this.activeWorkspace.id : 'personal';
  }

  async setActiveWorkspace(workspace) {
    this.activeWorkspace = workspace;
    await window.db.setSetting('active_workspace', this.activeWorkspace);
    this.notify();
  }

  async switchToPersonal() {
    await this.setActiveWorkspace({
      type: 'PERSONAL',
      id: 'personal',
      name: 'Mi Espacio Personal'
    });
  }

  async switchToGroup(groupId) {
    const group = this.groups.find(g => g.id === groupId);
    if (!group) {
      throw new Error('No tienes acceso a este grupo o no existe.');
    }

    const isOwner = this.currentUser && group.owner_email === this.currentUser.email;

    await this.setActiveWorkspace({
      type: 'GROUP',
      id: group.id,
      name: group.name,
      owner_email: group.owner_email,
      isOwner,
      members: group.members || []
    });
  }

  // --- Gestión de Grupos ---

  async refreshUserGroups() {
    const allGroups = await window.db.getGroups();
    if (!this.currentUser) {
      this.groups = [];
      return [];
    }

    const userEmail = this.currentUser.email.toLowerCase();
    
    // Regla de Seguridad: Solo grupos donde el correo esté en la lista members
    this.groups = allGroups.filter(g => {
      const members = (g.members || []).map(m => m.toLowerCase());
      return members.includes(userEmail);
    });

    return this.groups;
  }

  /**
   * Crea un nuevo grupo compartido
   * El creador se convierte en el Admin exclusivo
   */
  async createGroup(groupName) {
    if (!this.currentUser) {
      throw new Error('Debes iniciar sesión con Google para crear un grupo.');
    }

    const cleanName = groupName.trim();
    if (!cleanName) {
      throw new Error('El nombre del grupo no puede estar vacío.');
    }

    const groupId = 'grp_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
    const now = new Date().toISOString();

    const newGroup = {
      id: groupId,
      name: cleanName,
      owner_email: this.currentUser.email.toLowerCase(),
      members: [this.currentUser.email.toLowerCase()],
      created_at: now,
      updated_at: now
    };

    await window.db.saveGroup(newGroup);
    await this.refreshUserGroups();
    await this.switchToGroup(groupId);
    return newGroup;
  }

  /**
   * Invita a una persona al grupo usando EXCLUSIVAMENTE su correo de Gmail
   * Solo el Admin (owner) puede ejecutar esta acción
   */
  async inviteMember(groupId, emailToInvite) {
    if (!this.currentUser) {
      throw new Error('Debes estar autenticado para invitar miembros.');
    }

    const group = await window.db.getGroupById(groupId);
    if (!group) {
      throw new Error('Grupo no encontrado.');
    }

    // Validación de Admin
    if (group.owner_email.toLowerCase() !== this.currentUser.email.toLowerCase()) {
      throw new Error('Solo el Administrador del grupo puede agregar o invitar miembros.');
    }

    const cleanEmail = (emailToInvite || '').trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      throw new Error('Correo electrónico inválido.');
    }

    const members = (group.members || []).map(m => m.toLowerCase());
    if (members.includes(cleanEmail)) {
      throw new Error(`El correo ${cleanEmail} ya es miembro de este grupo.`);
    }

    members.push(cleanEmail);
    group.members = members;
    group.updated_at = new Date().toISOString();

    await window.db.saveGroup(group);
    await this.refreshUserGroups();
    this.notify();
    return group;
  }

  /**
   * Expulsa a un miembro del grupo (Solo Admin)
   */
  async removeMember(groupId, emailToRemove) {
    if (!this.currentUser) return;
    const group = await window.db.getGroupById(groupId);
    if (!group) return;

    if (group.owner_email.toLowerCase() !== this.currentUser.email.toLowerCase()) {
      throw new Error('Solo el Administrador del grupo puede remover miembros.');
    }

    const cleanEmail = emailToRemove.trim().toLowerCase();
    if (cleanEmail === group.owner_email.toLowerCase()) {
      throw new Error('El Administrador no puede removerse a sí mismo del grupo.');
    }

    group.members = (group.members || []).filter(m => m.toLowerCase() !== cleanEmail);
    group.updated_at = new Date().toISOString();

    await window.db.saveGroup(group);
    await this.refreshUserGroups();
    this.notify();
    return group;
  }

  // --- MOTOR DE CLONACIÓN: Copiar del Grupo a mi Espacio Personal ---

  /**
   * Copia un producto individual del grupo al espacio personal del usuario
   */
  async copyProductToPersonal(product, options = {}) {
    const updatePriceIfExisting = options.updatePriceIfExisting !== false;
    const currentRate = window.bcvService.rate;

    // 1. Obtener la tienda original en el grupo
    const groupStore = await window.db.getById('stores', product.store_id);
    const storeName = groupStore ? groupStore.name : 'Tienda Importada';

    // 2. Buscar o crear la tienda en el espacio PERSONAL
    let personalStore = await window.db.findStoreByNameInWorkspace(storeName, 'personal');
    if (!personalStore) {
      const newStoreId = await window.db.saveStore({
        workspace_id: 'personal',
        name: storeName,
        maps_url: groupStore ? groupStore.maps_url : `https://maps.google.com/?q=${encodeURIComponent(storeName)}`,
        lat: groupStore ? groupStore.lat : null,
        lng: groupStore ? groupStore.lng : null,
        description: groupStore ? groupStore.description : 'Copiada desde grupo'
      });
      personalStore = await window.db.getById('stores', newStoreId);
    }

    // 3. Buscar si el producto ya existe en la tienda personal
    const existingPersonalProd = await window.db.findProductByStoreAndName(personalStore.id, product.name);

    if (existingPersonalProd) {
      if (updatePriceIfExisting) {
        // Actualizar precio más reciente, conservar la valoración de estrellas personal
        existingPersonalProd.current_price = product.current_price;
        existingPersonalProd.original_currency = product.original_currency || 'USD';
        existingPersonalProd.updated_at = new Date().toISOString();
        await window.db.saveProduct(existingPersonalProd, 'COPIA_GRUPO', currentRate);
        return { action: 'updated', product: existingPersonalProd };
      }
      return { action: 'skipped', product: existingPersonalProd };
    } else {
      // Crear nuevo producto en el espacio personal (rating vacío para valoración personal del usuario)
      const newPersonalProd = {
        workspace_id: 'personal',
        store_id: personalStore.id,
        name: product.name,
        current_price: product.current_price,
        original_currency: product.original_currency || 'USD',
        rating: null, // Regla: no sobreescribe estrellas, el usuario califica a su criterio
        description: product.description || ''
      };

      const saved = await window.db.saveProduct(newPersonalProd, 'COPIA_GRUPO', currentRate);
      return { action: 'created', product: saved };
    }
  }

  /**
   * Copia todos los productos de una tienda del grupo al espacio personal
   */
  async copyStoreToPersonal(storeId, options = {}) {
    const store = await window.db.getById('stores', storeId);
    if (!store) throw new Error('Tienda no encontrada');

    const products = await window.db.getProductsByStore(storeId);
    let createdCount = 0;
    let updatedCount = 0;

    for (const prod of products) {
      const res = await this.copyProductToPersonal(prod, options);
      if (res.action === 'created') createdCount++;
      if (res.action === 'updated') updatedCount++;
    }

    return {
      storeName: store.name,
      createdCount,
      updatedCount,
      total: products.length
    };
  }

  /**
   * Clona toda la biblioteca del grupo activo al espacio personal del usuario
   */
  async copyAllActiveGroupToPersonal(options = {}) {
    if (this.activeWorkspace.type !== 'GROUP') {
      throw new Error('Debes estar en un espacio grupal para copiar sus datos.');
    }

    const groupId = this.activeWorkspace.id;
    const groupStores = await window.db.getStores(groupId);
    const groupProducts = await window.db.getProducts(groupId);

    let createdStores = 0;
    let createdProducts = 0;
    let updatedProducts = 0;

    for (const prod of groupProducts) {
      const res = await this.copyProductToPersonal(prod, options);
      if (res.action === 'created') createdProducts++;
      if (res.action === 'updated') updatedProducts++;
    }

    return {
      groupName: this.activeWorkspace.name,
      storesCount: groupStores.length,
      createdProducts,
      updatedProducts
    };
  }

  // --- Subscripción a Cambios ---
  subscribe(listener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  notify() {
    for (const listener of this.listeners) {
      try {
        listener({
          currentUser: this.currentUser,
          activeWorkspace: this.activeWorkspace,
          groups: this.groups
        });
      } catch (e) {
        console.error(e);
      }
    }
  }
}

window.authGroups = new AuthGroupsService();
