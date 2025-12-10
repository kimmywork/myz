export class IndexerClient {
  private sw: ServiceWorker | null = null;
  private statusCallback: ((msg: string) => void) | null = null;

  constructor(onStatusUpdate?: (msg: string) => void) {
    this.statusCallback = onStatusUpdate || null;
  }

  async init() {
    if (!('serviceWorker' in navigator)) {
      throw new Error('Service Worker not supported');
    }

    try {
      const swUrl = import.meta.env.PROD ? 'sw.js' : '/ui/sw.ts';
      const registration = await navigator.serviceWorker.register(swUrl, {
        type: 'module',
        scope: './'
      });

      if (registration.installing) {
        this.updateStatus('Service Worker installing...');
      } else if (registration.waiting) {
        this.updateStatus('Service Worker installed.');
      } else if (registration.active) {
        this.updateStatus('Service Worker active.');
        this.sw = registration.active;
      }

      navigator.serviceWorker.addEventListener('controllerchange', () => {
        this.sw = navigator.serviceWorker.controller;
        this.updateStatus('Service Worker controller changed.');
      });

      await navigator.serviceWorker.ready;
      this.sw = registration.active;
      this.updateStatus('Service Worker Ready!');

    } catch (error) {
      this.updateStatus(`SW Registration failed: ${error}`);
      throw error;
    }
  }

  private updateStatus(msg: string) {
    if (this.statusCallback) this.statusCallback(msg);
  }

  async sendMessage(type: string, payload: any = {}): Promise<any> {
    if (!this.sw) throw new Error('No Service Worker active');
    
    return new Promise((resolve, reject) => {
      const channel = new MessageChannel();
      channel.port1.onmessage = (event) => {
        if (event.data.error) reject(event.data.error);
        else resolve(event.data.result);
      };
      this.sw!.postMessage({ type, payload }, [channel.port2]);
    });
  }
}
