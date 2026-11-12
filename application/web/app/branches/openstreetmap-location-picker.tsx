"use client";

import Script from "next/script";
import { MapPin, Search } from "lucide-react";
import styles from "./openstreetmap-location-picker.module.css";
import { useCallback, useEffect, useRef, useState } from "react";

export type SelectedBranchLocation = {
  address: string;
  city: string;
  province: string;
  postalCode: string;
  latitude: number;
  longitude: number;
};

type Props = {
  value: {
    address?: string;
    city?: string;
    province?: string;
    postalCode?: string;
    latitude: number | null;
    longitude: number | null;
  };
  onSelect: (location: SelectedBranchLocation) => void;
};
type Point = { lat: number; lng: number };
type LeafletMarker = {
  setLatLng(point: Point): LeafletMarker;
  addTo(map: LeafletMap): LeafletMarker;
};
type LeafletMap = {
  setView(point: [number, number], zoom: number): LeafletMap;
  on(event: "click", listener: (event: { latlng: Point }) => void): LeafletMap;
  remove(): void;
  invalidateSize(options?: { pan?: boolean }): LeafletMap;
};
type Leaflet = {
  map(element: HTMLElement, options?: object): LeafletMap;
  tileLayer(url: string, options: object): { addTo(map: LeafletMap): unknown };
  marker(point: Point): LeafletMarker;
};
type SearchResult = {
  lat: string;
  lon: string;
  display_name: string;
  address?: Record<string, string>;
};

declare global {
  interface Window {
    L?: Leaflet;
  }
}

const leafletCss = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const leafletJs = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
const searchCache = new Map<string, SearchResult[]>();
let lastGeocodeAt = 0;

export function OpenStreetMapLocationPicker({ value, onSelect }: Props) {
  const mapElement = useRef<HTMLDivElement>(null);
  const selectRef = useRef(onSelect);
  const valueRef = useRef(value);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<LeafletMarker | null>(null);
  const [ready, setReady] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    selectRef.current = onSelect;
    valueRef.current = value;
  }, [onSelect, value]);

  useEffect(() => {
    if (!document.querySelector(`link[href="${leafletCss}"]`)) {
      const stylesheet = document.createElement("link");
      stylesheet.rel = "stylesheet";
      stylesheet.href = leafletCss;
      stylesheet.integrity =
        "sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=";
      stylesheet.crossOrigin = "";
      document.head.append(stylesheet);
    }
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!ready || !mapElement.current || !window.L || mapRef.current) return;
    const location = valueRef.current;
    const hasCoordinates =
      typeof location.latitude === "number" &&
      typeof location.longitude === "number";
    const center: Point = hasCoordinates
      ? { lat: location.latitude!, lng: location.longitude! }
      : { lat: 12.8797, lng: 121.774 };
    const map = window.L.map(mapElement.current, {
      scrollWheelZoom: false,
    }).setView([center.lat, center.lng], hasCoordinates ? 15 : 5);
    window.L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>',
    }).addTo(map);
    mapRef.current = map;
    if (hasCoordinates) markerRef.current = window.L.marker(center).addTo(map);
    map.on("click", ({ latlng }) => {
      if (markerRef.current) markerRef.current.setLatLng(latlng);
      else markerRef.current = window.L!.marker(latlng).addTo(map);
      const current = valueRef.current;
      selectRef.current({
        address: current.address ?? "",
        city: current.city ?? "",
        province: current.province ?? "",
        postalCode: current.postalCode ?? "",
        latitude: latlng.lat,
        longitude: latlng.lng,
      });
      setError("");
    });
    const resize = () => map.invalidateSize({ pan: false });
    const observer = new ResizeObserver(resize);
    observer.observe(mapElement.current);
    const frame = window.requestAnimationFrame(resize);
    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frame);
    };
  }, [ready]);

  const choose = useCallback((result: SearchResult) => {
    const lat = Number(result.lat);
    const lng = Number(result.lon);
    const address = result.address ?? {};
    const street = [address.house_number, address.road]
      .filter(Boolean)
      .join(" ");
    const city =
      address.city ??
      address.town ??
      address.village ??
      address.municipality ??
      address.suburb ??
      "";
    const province = address.state ?? address.province ?? "";
    const postalCode = address.postcode ?? "";
    const formattedAddress =
      [
        street,
        address.neighbourhood,
        address.suburb,
        city,
        province,
        postalCode,
      ]
        .filter(
          (part, index, parts) =>
            Boolean(part) && parts.indexOf(part) === index,
        )
        .join(", ") || result.display_name;
    selectRef.current({
      address: formattedAddress,
      city,
      province,
      postalCode,
      latitude: lat,
      longitude: lng,
    });
    if (mapRef.current) {
      mapRef.current.setView([lat, lng], 16);
      if (markerRef.current) markerRef.current.setLatLng({ lat, lng });
      else if (window.L)
        markerRef.current = window.L.marker({ lat, lng }).addTo(mapRef.current);
    }
    setResults([]);
    setError("");
  }, []);

  async function searchLocation() {
    const search = query.trim();
    if (!search) {
      setError("Enter an address or place to search.");
      return;
    }
    const key = search.toLowerCase();
    setSearching(true);
    setError("");
    try {
      let matches = searchCache.get(key);
      if (!matches) {
        const wait = Math.max(0, 1100 - (Date.now() - lastGeocodeAt));
        if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
        lastGeocodeAt = Date.now();
        const params = new URLSearchParams({
          q: search,
          format: "jsonv2",
          addressdetails: "1",
          limit: "5",
          countrycodes: "ph",
        });
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?${params}`,
          { headers: { Accept: "application/json" } },
        );
        if (!response.ok)
          throw new Error("Location search is temporarily unavailable.");
        matches = (await response.json()) as SearchResult[];
        searchCache.set(key, matches);
      }
      setResults(matches);
      if (matches.length === 0)
        setError(
          "No results found. Try a nearby landmark or a more complete address.",
        );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not search for that location.",
      );
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className={`branch-location-picker ${styles.picker}`}>
      <Script
        src={leafletJs}
        strategy="afterInteractive"
        integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo="
        crossOrigin="anonymous"
        onReady={() => setReady(true)}
        onError={() => {
          setMapFailed(true);
          setError(
            "The map could not load. Enter the location details manually.",
          );
        }}
      />
      <div className={styles.heading}>
        <MapPin size={17} aria-hidden="true" />
        <div>
          <strong>Find branch location</strong>
          <p>Search a place, then confirm the address below.</p>
        </div>
      </div>
      <div className={`branch-map-search-form ${styles.search}`} role="search">
        <label htmlFor="branch-map-search">Search address or landmark</label>
        <input
          autoComplete="off"
          id="branch-map-search"
          maxLength={200}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              if (!searching) void searchLocation();
            }
          }}
          placeholder="Address, building or landmark"
          value={query}
        />
        <button
          className="branch-secondary"
          disabled={searching || !query.trim()}
          onClick={() => void searchLocation()}
          type="button"
        >
          <Search size={15} aria-hidden="true" />
          {searching ? "Searching..." : "Search"}
        </button>
      </div>
      {results.length > 0 && (
        <ul
          aria-label="Location search results"
          className={`branch-map-results ${styles.results}`}
        >
          {results.map((result) => (
            <li key={`${result.lat}:${result.lon}`}>
              <button onClick={() => choose(result)} type="button">
                {result.display_name}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className={styles.mapFrame}>
        <div
          aria-label="OpenStreetMap location picker. Click to place the branch marker."
          className={`branch-map ${styles.map}`}
          ref={mapElement}
          role="region"
        />
        {!ready && (
          <div className={styles.loading} role="status">
            {mapFailed
              ? "Map unavailable. Enter the address below."
              : "Loading map..."}
          </div>
        )}
      </div>
      <p className="branch-map-help">
        Click the map to move the pin. Map data © OpenStreetMap contributors.{" "}
        <a
          href="https://www.openstreetmap.org/fixthemap"
          rel="noreferrer"
          target="_blank"
        >
          Report a map issue
        </a>
      </p>
      {value.latitude !== null && value.longitude !== null && (
        <p className="branch-map-coordinates" aria-live="polite">
          Selected pin: {value.latitude.toFixed(6)},{" "}
          {value.longitude.toFixed(6)}
        </p>
      )}
      {error && (
        <p className="branch-map-error" role="status">
          {error}
        </p>
      )}
    </div>
  );
}
