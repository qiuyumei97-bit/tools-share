const APP_CONFIG = {
    STORAGE_KEY: 'webtool_manager_data',
    DB_NAME: 'WebToolDB',
    DB_VERSION: 1
};

class IndexedDBManager {
    static db = null;

    static async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(APP_CONFIG.DB_NAME, APP_CONFIG.DB_VERSION);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('tools')) {
                    const toolStore = db.createObjectStore('tools', { keyPath: 'id' });
                    toolStore.createIndex('name', 'name', { unique: false });
                    toolStore.createIndex('category', 'category', { unique: false });
                }
                if (!db.objectStoreNames.contains('settings')) {
                    db.createObjectStore('settings', { keyPath: 'id' });
                }
            };
        });
    }

    static async getTools() {
        if (!this.db) await this.init();
        return new Promise((resolve) => {
            const transaction = this.db.transaction(['tools'], 'readonly');
            const store = transaction.objectStore('tools');
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => resolve([]);
        });
    }

    static async saveTool(tool) {
        if (!this.db) await this.init();
        return new Promise((resolve) => {
            const transaction = this.db.transaction(['tools'], 'readwrite');
            const store = transaction.objectStore('tools');
            const request = store.put(tool);
            request.onsuccess = () => resolve(tool);
            request.onerror = () => resolve(null);
        });
    }

    static async deleteTool(toolId) {
        if (!this.db) await this.init();
        return new Promise((resolve) => {
            const transaction = this.db.transaction(['tools'], 'readwrite');
            const store = transaction.objectStore('tools');
            const request = store.delete(toolId);
            request.onsuccess = () => resolve(true);
            request.onerror = () => resolve(false);
        });
    }

    static async getToolById(toolId) {
        if (!this.db) await this.init();
        return new Promise((resolve) => {
            const transaction = this.db.transaction(['tools'], 'readonly');
            const store = transaction.objectStore('tools');
            const request = store.get(toolId);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => resolve(null);
        });
    }

    static async saveSettings(settings) {
        if (!this.db) await this.init();
        return new Promise((resolve) => {
            const transaction = this.db.transaction(['settings'], 'readwrite');
            const store = transaction.objectStore('settings');
            const request = store.put({ id: 'main', ...settings });
            request.onsuccess = () => resolve(settings);
            request.onerror = () => resolve(null);
        });
    }

    static async getSettings() {
        if (!this.db) await this.init();
        return new Promise((resolve) => {
            const transaction = this.db.transaction(['settings'], 'readonly');
            const store = transaction.objectStore('settings');
            const request = store.get('main');
            request.onsuccess = () => resolve(request.result || this.getDefaultSettings());
            request.onerror = () => resolve(this.getDefaultSettings());
        });
    }

    static getDefaultSettings() {
        return {
            id: 'main',
            siteName: '我的网页工具箱',
            siteDescription: '个人网页工具集合',
            ownerName: '管理员',
            isOwnerSetUp: false,
            ownerPassword: null
        };
    }
}

class StorageManager {
    static async getData() {
        const settings = await IndexedDBManager.getSettings();
        const tools = await IndexedDBManager.getTools();
        return {
            isOwnerSetUp: settings.isOwnerSetUp || false,
            ownerPassword: settings.ownerPassword || null,
            tools: tools,
            settings: {
                siteName: settings.siteName || '我的网页工具箱',
                siteDescription: settings.siteDescription || '个人网页工具集合',
                ownerName: settings.ownerName || '管理员'
            }
        };
    }

    static async saveData(data) {
        await IndexedDBManager.saveSettings({
            id: 'main',
            siteName: data.settings.siteName,
            siteDescription: data.settings.siteDescription,
            ownerName: data.settings.ownerName,
            isOwnerSetUp: data.isOwnerSetUp,
            ownerPassword: data.ownerPassword
        });
        for (const tool of data.tools) {
            await IndexedDBManager.saveTool(tool);
        }
    }

    static async getTools() {
        return await IndexedDBManager.getTools();
    }

    static async saveTool(tool) {
        return await IndexedDBManager.saveTool(tool);
    }

    static async deleteTool(toolId) {
        return await IndexedDBManager.deleteTool(toolId);
    }

    static async getToolById(toolId) {
        return await IndexedDBManager.getToolById(toolId);
    }

    static async getSettings() {
        const settings = await IndexedDBManager.getSettings();
        return {
            siteName: settings.siteName || '我的网页工具箱',
            siteDescription: settings.siteDescription || '个人网页工具集合',
            ownerName: settings.ownerName || '管理员'
        };
    }

    static async updateSettings(settings) {
        const current = await IndexedDBManager.getSettings();
        return await IndexedDBManager.saveSettings({
            ...current,
            ...settings
        });
    }

    static async exportData() {
        const data = await this.getData();
        return JSON.stringify(data, null, 2);
    }

    static async importData(jsonString) {
        try {
            const data = JSON.parse(jsonString);
            await this.saveData(data);
            return { success: true };
        } catch (error) {
            return { success: false, error: '无效的数据格式' };
        }
    }

    static async backupToFile() {
        const data = await this.exportData();
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `webtools-backup-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    static async restoreFromFile(file) {
        const text = await file.text();
        return await this.importData(text);
    }
}

class AuthManager {
    static isLoggedIn() {
        return sessionStorage.getItem('isLoggedIn') === 'true';
    }

    static async login(password) {
        const data = await StorageManager.getData();
        const inputHash = this.hashPassword(password);

        if (!data.isOwnerSetUp) {
            data.isOwnerSetUp = true;
            data.ownerPassword = inputHash;
            await StorageManager.saveData(data);
            sessionStorage.setItem('isLoggedIn', 'true');
            return { success: true, isNewOwner: true };
        }

        if (inputHash === data.ownerPassword) {
            sessionStorage.setItem('isLoggedIn', 'true');
            return { success: true, isNewOwner: false };
        }

        return { success: false, error: '密码错误' };
    }

    static logout() {
        sessionStorage.removeItem('isLoggedIn');
        window.location.href = 'index.html';
    }

    static hashPassword(password) {
        let hash = 0;
        for (let i = 0; i < password.length; i++) {
            const char = password.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(16).padStart(16, '0');
    }

    static requireAuth() {
        if (!this.isLoggedIn()) {
            window.location.href = 'login.html';
            return false;
        }
        return true;
    }

    static async setOwnerName(name) {
        const settings = await StorageManager.getSettings();
        await StorageManager.updateSettings({ ...settings, ownerName: name });
    }

    static async getOwnerName() {
        const settings = await StorageManager.getSettings();
        return settings.ownerName || '管理员';
    }
}

class ToolManager {
    static async createTool(data) {
        const tool = {
            id: this.generateId(),
            name: data.name,
            description: data.description || '',
            category: data.category || 'other',
            tags: data.tags || [],
            icon: data.icon || '🛠️',
            files: data.files || [],
            url: data.url || null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            visits: 0
        };
        await StorageManager.saveTool(tool);
        return tool;
    }

    static async updateTool(toolId, data) {
        const tool = await StorageManager.getToolById(toolId);
        if (tool) {
            Object.assign(tool, data, { updatedAt: new Date().toISOString() });
            await StorageManager.saveTool(tool);
            return tool;
        }
        return null;
    }

    static async deleteTool(toolId) {
        await StorageManager.deleteTool(toolId);
    }

    static generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
    }

    static async incrementVisits(toolId) {
        const tool = await StorageManager.getToolById(toolId);
        if (tool) {
            tool.visits = (tool.visits || 0) + 1;
            await StorageManager.saveTool(tool);
        }
    }

    static getShareUrl(toolId) {
        const baseUrl = window.location.origin + window.location.pathname.replace(/[^/]*$/, '');
        return `${baseUrl}tool.html?id=${toolId}`;
    }

    static copyToClipboard(text) {
        navigator.clipboard.writeText(text).then(() => {
            Toast.show('链接已复制到剪贴板', 'success');
        }).catch(() => {
            Toast.show('复制失败', 'error');
        });
    }

    static async fetchUrlContent(url) {
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error('无法访问该链接');

            const contentType = response.headers.get('content-type');
            const content = await response.text();

            return {
                success: true,
                content: content,
                contentType: contentType,
                fileName: url.split('/').pop() || 'index.html'
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }
}

class Toast {
    static container = null;

    static init() {
        if (!this.container) {
            this.container = document.createElement('div');
            this.container.className = 'toast-container';
            document.body.appendChild(this.container);
        }
    }

    static show(message, type = 'success') {
        this.init();
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;

        const icons = {
            success: '✅',
            error: '❌',
            warning: '⚠️',
            info: 'ℹ️'
        };

        toast.innerHTML = `
            <span class="toast-icon">${icons[type]}</span>
            <span class="toast-message">${message}</span>
        `;

        this.container.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }
}

class FileHandler {
    static async handleFiles(files) {
        const processedFiles = [];

        for (const file of files) {
            const processed = await this.processFile(file);
            processedFiles.push(processed);
        }

        return processedFiles;
    }

    static async processFile(file) {
        const ext = file.name.split('.').pop().toLowerCase();
        const isText = ['html', 'css', 'js', 'json', 'txt', 'md', 'xml', 'svg'].includes(ext);
        const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'bmp'].includes(ext);

        let content = '';
        let type = 'binary';

        if (isText) {
            content = await file.text();
            type = 'text';
        } else if (isImage) {
            content = await this.fileToBase64(file);
            type = 'image';
        }

        return {
            name: file.name,
            size: file.size,
            type: type,
            ext: ext,
            content: content,
            isText: isText,
            isImage: isImage
        };
    }

    static fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    static formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }
}

class Router {
    static init() {
        const path = window.location.pathname;
        const page = path.split('/').pop() || 'index.html';

        if (page === 'dashboard.html' && !AuthManager.isLoggedIn()) {
            window.location.href = 'login.html';
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    Router.init();
});
