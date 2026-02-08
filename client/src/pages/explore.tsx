import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.heat";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  MapPin, Calendar, Users, ExternalLink, Clock,
  Flame, GraduationCap, Tag, ChevronRight
} from "lucide-react";

const TAMU_CENTER: [number, number] = [30.6187, -96.3365];
const DEFAULT_ZOOM = 15;

interface EventMarker {
  type: "event";
  id: string;
  title: string;
  category: string;
  location: string | null;
  locationLat: number;
  locationLng: number;
  dateTime: string | null;
  rsvpCount: number;
  personaScore: number;
  isDeal: boolean;
  priceInfo: string | null;
  friendsGoing: { id: string; firstName: string | null; profileImageUrl: string | null }[];
  heatIntensity: number;
}

interface ClubMarker {
  type: "club";
  id: string;
  title: string;
  domain: string;
  locationLat: number;
  locationLng: number;
  meetingLocation: string | null;
  meetingDay: string | null;
  meetingTime: string | null;
  nextMeetingAt: string | null;
}

type MapMarkerType = EventMarker | ClubMarker;

function getCategoryColor(category: string): string {
  switch (category) {
    case "parties": return "#ec4899";
    case "deals": return "#10b981";
    case "campus": return "#3b82f6";
    case "study": return "#f59e0b";
    case "shows": return "#a855f7";
    case "misc": return "#14b8a6";
    default: return "#6b7280";
  }
}

function getDomainColor(domain: string): string {
  switch (domain) {
    case "academic": return "#6366f1";
    case "professional": return "#64748b";
    case "social": return "#d946ef";
    case "sports": return "#22c55e";
    case "volunteering": return "#f97316";
    default: return "#6b7280";
  }
}

function createEventIcon(category: string, rsvpCount: number): L.DivIcon {
  const color = getCategoryColor(category);
  const size = Math.min(36, 20 + rsvpCount * 0.5);
  return L.divIcon({
    className: "custom-event-marker",
    html: `<div style="
      width: ${size}px; height: ${size}px;
      background: ${color};
      border: 2px solid rgba(255,255,255,0.9);
      border-radius: 50%;
      box-shadow: 0 0 ${Math.min(20, 8 + rsvpCount * 0.3)}px ${color}88, 0 2px 8px rgba(0,0,0,0.4);
      display: flex; align-items: center; justify-content: center;
    "><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/></svg></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function createClubIcon(domain: string): L.DivIcon {
  const color = getDomainColor(domain);
  return L.divIcon({
    className: "custom-club-marker",
    html: `<div style="
      width: 16px; height: 16px;
      background: ${color}44;
      border: 1.5px solid ${color}aa;
      border-radius: 50%;
      box-shadow: 0 0 6px ${color}44;
    "></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

function formatEventTime(dateStr: string | null): string {
  if (!dateStr) return "TBD";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

function buildHeatPoints(events: EventMarker[], clubs: ClubMarker[]) {
  const spreadPoints: [number, number, number][] = [];
  const SPREAD = 0.0008;

  events.forEach(e => {
    const intensity = Math.min(1.0, 0.25 + (e.rsvpCount / 200) * 0.75);
    spreadPoints.push([e.locationLat, e.locationLng, intensity]);
    const offsets = [
      [SPREAD, 0], [-SPREAD, 0], [0, SPREAD], [0, -SPREAD],
      [SPREAD * 0.7, SPREAD * 0.7], [-SPREAD * 0.7, SPREAD * 0.7],
      [SPREAD * 0.7, -SPREAD * 0.7], [-SPREAD * 0.7, -SPREAD * 0.7],
    ];
    const ringIntensity = intensity * 0.55;
    offsets.forEach(([dLat, dLng]) => {
      spreadPoints.push([e.locationLat + dLat, e.locationLng + dLng, ringIntensity]);
    });
    const SPREAD2 = SPREAD * 1.8;
    const outerOffsets = [
      [SPREAD2, 0], [-SPREAD2, 0], [0, SPREAD2], [0, -SPREAD2],
    ];
    outerOffsets.forEach(([dLat, dLng]) => {
      spreadPoints.push([e.locationLat + dLat, e.locationLng + dLng, intensity * 0.25]);
    });
  });

  clubs.forEach(c => {
    const clubIntensity = 0.18;
    spreadPoints.push([c.locationLat, c.locationLng, clubIntensity]);
    const clubOffsets = [
      [SPREAD * 0.5, 0], [-SPREAD * 0.5, 0], [0, SPREAD * 0.5], [0, -SPREAD * 0.5],
    ];
    clubOffsets.forEach(([dLat, dLng]) => {
      spreadPoints.push([c.locationLat + dLat, c.locationLng + dLng, clubIntensity * 0.5]);
    });
  });

  const glowPoints: [number, number, number][] = events.map(e => [
    e.locationLat,
    e.locationLng,
    Math.min(0.8, 0.2 + (e.rsvpCount / 200) * 0.6),
  ]);

  return { spreadPoints, glowPoints };
}

function HeatLayer({ events, clubs }: { events: EventMarker[]; clubs: ClubMarker[] }) {
  const map = useMap();
  const layersRef = useRef<any[]>([]);

  useEffect(() => {
    layersRef.current.forEach(layer => map.removeLayer(layer));
    layersRef.current = [];

    if (!events.length && !clubs.length) return;

    const { spreadPoints, glowPoints } = buildHeatPoints(events, clubs);

    const baseLayer = (L as any).heatLayer(spreadPoints, {
      radius: 55,
      blur: 40,
      maxZoom: 18,
      max: 1.0,
      minOpacity: 0.12,
      gradient: {
        0.0: "rgba(75, 85, 99, 0)",
        0.1: "#4b5563",
        0.2: "#3f6b5e",
        0.35: "#2d7a5f",
        0.5: "#059669",
        0.65: "#10b981",
        0.8: "#34d399",
        0.9: "#6ee7b7",
        1.0: "#a7f3d0",
      },
    });
    baseLayer.addTo(map);
    layersRef.current.push(baseLayer);

    const glowLayer = (L as any).heatLayer(glowPoints, {
      radius: 80,
      blur: 55,
      maxZoom: 18,
      max: 0.8,
      minOpacity: 0.06,
      gradient: {
        0.0: "rgba(75, 85, 99, 0)",
        0.2: "#4b556322",
        0.4: "#3f6b5e33",
        0.6: "#05966622",
        0.8: "#10b98118",
        1.0: "#34d39915",
      },
    });
    glowLayer.addTo(map);
    layersRef.current.push(glowLayer);

    return () => {
      layersRef.current.forEach(layer => map.removeLayer(layer));
      layersRef.current = [];
    };
  }, [map, events, clubs]);

  return null;
}

function MapLegend({ showClubs }: { showClubs: boolean }) {
  return (
    <div className="absolute bottom-4 left-4 z-[1000] bg-zinc-900/90 backdrop-blur-sm rounded-md p-3 border border-zinc-700/50 max-w-[200px]" data-testid="map-legend">
      <p className="text-[10px] font-semibold text-zinc-300 mb-2 uppercase tracking-wider">Events</p>
      <div className="space-y-1">
        {[
          { label: "Parties", color: "#ec4899" },
          { label: "Deals", color: "#10b981" },
          { label: "Campus", color: "#3b82f6" },
          { label: "Study", color: "#f59e0b" },
          { label: "Shows", color: "#a855f7" },
          { label: "Misc", color: "#14b8a6" },
        ].map(({ label, color }) => (
          <div key={label} className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
            <span className="text-[10px] text-zinc-400">{label}</span>
          </div>
        ))}
      </div>
      {showClubs && (
        <>
          <p className="text-[10px] font-semibold text-zinc-300 mt-3 mb-2 uppercase tracking-wider">Clubs</p>
          <div className="space-y-1">
            {[
              { label: "Academic", color: "#6366f1" },
              { label: "Professional", color: "#64748b" },
              { label: "Social", color: "#d946ef" },
              { label: "Sports", color: "#22c55e" },
              { label: "Service", color: "#f97316" },
            ].map(({ label, color }) => (
              <div key={label} className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full shrink-0 opacity-50" style={{ background: color, border: `1px solid ${color}` }} />
                <span className="text-[10px] text-zinc-400">{label}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function ExplorePage() {
  const [showClubs, setShowClubs] = useState(true);

  const { data, isLoading } = useQuery<{ events: EventMarker[]; clubs: ClubMarker[] }>({
    queryKey: ["/api/explore/map-data"],
  });

  const events = data?.events || [];
  const clubs = data?.clubs || [];

  const spreadMarkers = useMemo(() => {
    function spreadOverlapping(markers: MapMarkerType[]): MapMarkerType[] {
      const coordGroups = new Map<string, number[]>();
      markers.forEach((m, i) => {
        const key = `${m.locationLat.toFixed(4)},${m.locationLng.toFixed(4)}`;
        if (!coordGroups.has(key)) coordGroups.set(key, []);
        coordGroups.get(key)!.push(i);
      });

      const result = markers.map(m => ({ ...m }));
      coordGroups.forEach((indices) => {
        if (indices.length <= 1) return;
        const radius = 0.0006 + 0.00015 * Math.min(indices.length, 12);
        indices.forEach((idx, i) => {
          const angle = (2 * Math.PI * i) / indices.length;
          result[idx] = {
            ...result[idx],
            locationLat: result[idx].locationLat + radius * Math.cos(angle),
            locationLng: result[idx].locationLng + radius * Math.sin(angle),
          };
        });
      });
      return result;
    }

    return spreadOverlapping([...events]);
  }, [events]);

  const spreadClubs = useMemo(() => {
    function spreadOverlapping(markers: MapMarkerType[]): MapMarkerType[] {
      const coordGroups = new Map<string, number[]>();
      markers.forEach((m, i) => {
        const key = `${m.locationLat.toFixed(4)},${m.locationLng.toFixed(4)}`;
        if (!coordGroups.has(key)) coordGroups.set(key, []);
        coordGroups.get(key)!.push(i);
      });

      const result = markers.map(m => ({ ...m }));
      coordGroups.forEach((indices) => {
        if (indices.length <= 1) return;
        const radius = 0.0006 + 0.00015 * Math.min(indices.length, 12);
        indices.forEach((idx, i) => {
          const angle = (2 * Math.PI * i) / indices.length;
          result[idx] = {
            ...result[idx],
            locationLat: result[idx].locationLat + radius * Math.cos(angle),
            locationLng: result[idx].locationLng + radius * Math.sin(angle),
          };
        });
      });
      return result;
    }

    return spreadOverlapping([...clubs]);
  }, [clubs]);

  const allMarkers = useMemo(() => {
    const markers: MapMarkerType[] = [...spreadMarkers];
    if (showClubs) markers.push(...spreadClubs);
    return markers;
  }, [spreadMarkers, spreadClubs, showClubs]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center" style={{ height: "calc(100dvh - 3.5rem - 3.5rem)" }}>
        <div className="space-y-3 text-center">
          <Skeleton className="h-10 w-10 mx-auto rounded-md" />
          <Skeleton className="h-3 w-24 mx-auto" />
          <p className="text-xs text-muted-foreground">Loading map...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative" style={{ height: "calc(100dvh - 3.5rem - 3.5rem)" }} data-testid="explore-page">
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-2">
        <Badge
          variant="outline"
          className="bg-zinc-900/90 backdrop-blur-sm text-zinc-100 border-zinc-600/50 text-xs no-default-hover-elevate no-default-active-elevate"
        >
          <Flame className="h-3 w-3 mr-1 text-emerald-400" />
          {events.length} events in 48h
        </Badge>
      </div>

      <div className="absolute top-3 right-3 z-[1000] flex flex-col gap-2">
        <Button
          size="sm"
          variant={showClubs ? "default" : "outline"}
          className={cn(
            "text-xs",
            !showClubs && "bg-zinc-900/90 backdrop-blur-sm text-zinc-100 border-zinc-600/50"
          )}
          onClick={() => setShowClubs(!showClubs)}
          data-testid="button-toggle-clubs"
        >
          <GraduationCap className="h-3 w-3 mr-1" />
          Clubs
        </Button>
      </div>

      <MapContainer
        center={TAMU_CENTER}
        zoom={DEFAULT_ZOOM}
        className="h-full w-full"
        zoomControl={false}
        attributionControl={false}
        style={{ background: "#1a1a2e" }}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution=""
        />

        <HeatLayer events={spreadMarkers as EventMarker[]} clubs={showClubs ? spreadClubs as ClubMarker[] : []} />

        {allMarkers.map((marker) => (
          <Marker
            key={`${marker.type}-${marker.id}`}
            position={[marker.locationLat, marker.locationLng]}
            icon={marker.type === "event"
              ? createEventIcon(marker.category, marker.rsvpCount)
              : createClubIcon(marker.domain)
            }
          >
            <Popup
              className="custom-dark-popup"
              closeButton={false}
              maxWidth={280}
              minWidth={220}
            >
              {marker.type === "event" ? (
                <EventPopup event={marker} />
              ) : (
                <ClubPopup club={marker} />
              )}
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      <MapLegend showClubs={showClubs} />

      <style>{`
        .custom-dark-popup .leaflet-popup-content-wrapper {
          background: rgba(24, 24, 27, 0.95);
          color: #f4f4f5;
          border-radius: 12px;
          border: 1px solid rgba(63, 63, 70, 0.5);
          backdrop-filter: blur(12px);
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
          padding: 0;
        }
        .custom-dark-popup .leaflet-popup-content {
          margin: 0;
          font-size: 13px;
          line-height: 1.4;
        }
        .custom-dark-popup .leaflet-popup-tip {
          background: rgba(24, 24, 27, 0.95);
          border: 1px solid rgba(63, 63, 70, 0.5);
        }
        .leaflet-container {
          font-family: inherit;
        }
        .custom-event-marker, .custom-club-marker {
          background: transparent !important;
          border: none !important;
        }
      `}</style>
    </div>
  );
}

function EventPopup({ event }: { event: EventMarker }) {
  const [, setLocation] = useLocation();
  const color = getCategoryColor(event.category);
  const gmapsUrl = `https://www.google.com/maps/search/?api=1&query=${event.locationLat},${event.locationLng}`;

  return (
    <div className="p-3 space-y-2" data-testid={`popup-event-${event.id}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1">
            <div className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
            <span className="text-[10px] uppercase tracking-wider font-medium" style={{ color }}>{event.category}</span>
          </div>
          <button
            className="font-semibold text-sm text-zinc-100 leading-tight text-left flex items-center gap-1 group cursor-pointer"
            onClick={() => setLocation(`/events?event=${event.id}`)}
            data-testid={`link-event-detail-${event.id}`}
          >
            <span className="underline decoration-zinc-500/50 underline-offset-2 group-hover:decoration-zinc-300 transition-colors">{event.title}</span>
            <ChevronRight className="h-3 w-3 text-zinc-500 group-hover:text-zinc-300 shrink-0 transition-colors" />
          </button>
        </div>
        <div className="shrink-0 flex items-center gap-1 bg-emerald-500/15 text-emerald-400 rounded-md px-1.5 py-0.5 text-[10px] font-semibold border border-emerald-500/30">
          {event.personaScore}%
        </div>
      </div>

      <div className="space-y-1">
        {event.dateTime && (
          <div className="flex items-center gap-1.5 text-zinc-400 text-xs">
            <Clock className="h-3 w-3 shrink-0" />
            <span>{formatEventTime(event.dateTime)}</span>
          </div>
        )}
        {event.location && (
          <div className="flex items-center gap-1.5 text-zinc-400 text-xs">
            <MapPin className="h-3 w-3 shrink-0" />
            <span className="truncate">{event.location}</span>
          </div>
        )}
        <div className="flex items-center gap-1.5 text-zinc-400 text-xs">
          <Users className="h-3 w-3 shrink-0" />
          <span>{event.rsvpCount} going</span>
        </div>
      </div>

      {event.isDeal && event.priceInfo && (
        <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-medium">
          <Tag className="h-3 w-3 shrink-0" />
          <span>{event.priceInfo}</span>
        </div>
      )}

      {event.friendsGoing.length > 0 && (
        <div className="flex items-center gap-2">
          <div className="flex -space-x-1.5">
            {event.friendsGoing.slice(0, 3).map((f) => (
              <Avatar key={f.id} className="h-5 w-5 border border-zinc-800">
                <AvatarImage src={f.profileImageUrl || undefined} />
                <AvatarFallback className="text-[8px] bg-zinc-700 text-zinc-300">
                  {f.firstName?.[0] || "?"}
                </AvatarFallback>
              </Avatar>
            ))}
          </div>
          <span className="text-[10px] text-zinc-500">
            {event.friendsGoing.slice(0, 2).map(f => f.firstName).join(", ")} going
          </span>
        </div>
      )}

      <a
        href={gmapsUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-1.5 w-full mt-1 py-1.5 rounded-md bg-zinc-800 text-zinc-300 text-xs border border-zinc-700/50 no-underline"
        data-testid={`link-gmaps-event-${event.id}`}
      >
        <ExternalLink className="h-3 w-3" />
        Open in Google Maps
      </a>
    </div>
  );
}

function ClubPopup({ club }: { club: ClubMarker }) {
  const color = getDomainColor(club.domain);
  const gmapsUrl = `https://www.google.com/maps/search/?api=1&query=${club.locationLat},${club.locationLng}`;

  return (
    <div className="p-3 space-y-2" data-testid={`popup-club-${club.id}`}>
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm text-zinc-100 leading-tight">{club.title}</h3>
          <span className="text-[10px] uppercase tracking-wider font-medium" style={{ color }}>{club.domain}</span>
        </div>
      </div>

      <div className="space-y-1">
        {club.meetingLocation && (
          <div className="flex items-center gap-1.5 text-zinc-400 text-xs">
            <MapPin className="h-3 w-3 shrink-0" />
            <span>{club.meetingLocation}</span>
          </div>
        )}
        {club.meetingDay && club.meetingTime && (
          <div className="flex items-center gap-1.5 text-zinc-400 text-xs">
            <Calendar className="h-3 w-3 shrink-0" />
            <span>{club.meetingDay} at {club.meetingTime}</span>
          </div>
        )}
      </div>

      <a
        href={gmapsUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-1.5 w-full mt-1 py-1.5 rounded-md bg-zinc-800 text-zinc-300 text-xs border border-zinc-700/50 no-underline"
        data-testid={`link-gmaps-club-${club.id}`}
      >
        <ExternalLink className="h-3 w-3" />
        Open in Google Maps
      </a>
    </div>
  );
}
