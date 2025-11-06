import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Component, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { TranslationPipe } from '../../../../i18n/translation.pipe';

type StoreCategory = 'restaurant' | 'shop' | 'service';

interface StoreLocation {
  readonly id: string;
  readonly name: string;
  readonly address: string;
  readonly category: StoreCategory;
  readonly latitude: number;
  readonly longitude: number;
}

interface MarkerPosition {
  readonly id: string;
  readonly left: number;
  readonly top: number;
}

interface StoreView {
  readonly id: string;
  readonly store: StoreLocation;
  readonly left: number;
  readonly top: number;
  readonly category: StoreCategory;
}

interface BubblePosition {
  readonly left: number;
  readonly top: number;
}

interface SelectedStore extends StoreLocation {
  readonly mapsUrl: string;
}

@Component({
  selector: 'app-store-map',
  standalone: true,
  imports: [CommonModule, TranslationPipe],
  templateUrl: './store-map.component.html',
  styleUrls: ['./store-map.component.scss'],
})
export class StoreMapComponent {
  private readonly stores: readonly StoreLocation[] = [
    {
      id: 'la-palma',
      name: 'Bodegón La Palma',
      address: 'Calle del Comercio 12, Valencia',
      category: 'restaurant',
      latitude: 39.46975,
      longitude: -0.37739,
    },
    {
      id: 'atelier-sarai',
      name: 'Atelier Sarai',
      address: 'Av. de Blasco Ibáñez 45, Valencia',
      category: 'shop',
      latitude: 39.48066,
      longitude: -0.35357,
    },
    {
      id: 'libelula-digital',
      name: 'Libélula Digital',
      address: 'Carrer de Sant Vicent 88, Valencia',
      category: 'service',
      latitude: 39.47097,
      longitude: -0.37659,
    },
  ];

  private readonly markerPositions: readonly MarkerPosition[] = [
    { id: 'la-palma', left: 48, top: 62 },
    { id: 'atelier-sarai', left: 78, top: 36 },
    { id: 'libelula-digital', left: 60, top: 54 },
  ];

  readonly storesMap: Readonly<Record<string, StoreLocation>> = this.stores.reduce<Record<string, StoreLocation>>((acc, store) => {
    acc[store.id] = store;
    return acc;
  }, {});

  readonly selectedStoreId = signal<string | null>(null);
  readonly selectedStore = computed<SelectedStore | null>(() => {
    const currentId = this.selectedStoreId();
    if (!currentId) {
      return null;
    }
    const store = this.storesMap[currentId];
    if (!store) {
      return null;
    }
    const mapsUrl = this.buildMapsUrl(store);
    return { ...store, mapsUrl };
  });

  readonly storeViews = computed<readonly StoreView[]>(() => {
    return this.markerPositions
      .map<StoreView | null>((marker) => {
        const store = this.storesMap[marker.id];
        if (!store) {
          return null;
        }
        return {
          id: marker.id,
          store,
          left: marker.left,
          top: marker.top,
          category: store.category,
        };
      })
      .filter((view): view is StoreView => view !== null);
  });

  readonly selectedStoreView = computed<StoreView | null>(() => {
    const currentId = this.selectedStoreId();
    if (!currentId) {
      return null;
    }
    return this.storeViews().find((view) => view.id === currentId) ?? null;
  });

  readonly bubblePosition = computed<BubblePosition | null>(() => {
    const view = this.selectedStoreView();
    if (!view) {
      return null;
    }
    const clampedLeft = Math.min(Math.max(view.left, 8), 92);
    const rawTop = view.top - 12;
    const clampedTop = Math.max(Math.min(rawTop, 90), 6);
    return { left: clampedLeft, top: clampedTop };
  });

  private static readonly MAPS_BASE_URL = 'https://www.google.com/maps/search/?api=1';

  onStoreOptionClick(storeId: string) {
    const store = this.storesMap[storeId];
    if (!store) {
      return;
    }
    this.openInMaps(store);
  }

  onMarkerFocus(storeId: string) {
    this.selectedStoreId.set(storeId);
  }

  onMarkerBlur(storeId: string, event: FocusEvent) {
    if (!event.relatedTarget) {
      return;
    }
    const nextTarget = event.relatedTarget as HTMLElement;
    const nextStoreId = nextTarget.dataset?.['storeId'];
    if (nextStoreId === storeId) {
      return;
    }
    this.selectedStoreId.set(null);
  }

  onMarkerClick(storeId: string) {
    this.selectedStoreId.set(storeId);
  }

  onInfoBubbleClick() {
    const store = this.selectedStore();
    if (!store) {
      return;
    }
    this.openInMaps(store);
  }

  onInfoBubbleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.selectedStoreId.set(null);
      return;
    }
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }
    event.preventDefault();
    this.onInfoBubbleClick();
  }

  onListOptionKeydown(event: KeyboardEvent, storeId: string) {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }
    event.preventDefault();
    this.onStoreOptionClick(storeId);
  }

  trackStoreView(_: number, view: StoreView) {
    return view.id;
  }

  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  private openInMaps(store: StoreLocation) {
    if (!this.isBrowser) {
      return;
    }
    const url = this.buildMapsUrl(store);
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  private buildMapsUrl(store: StoreLocation) {
    const query = encodeURIComponent(`${store.latitude},${store.longitude}`);
    const label = encodeURIComponent(store.name);
    return `${StoreMapComponent.MAPS_BASE_URL}&query=${query}%20(${label})`;
  }
}
