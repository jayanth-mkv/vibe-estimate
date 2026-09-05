import type { Ref } from "react";
import { catalog, type HouseDocument, type HouseScope } from "@vibeestimate/scene-schema";

export function HousePlan({ document, selectedIds = [], region, onSelect, svgRef, focusRoomId }: {
  document: HouseDocument; selectedIds?: string[]; region?: HouseScope["region"];
  onSelect?: (id: string, surface?: "floor" | "front" | "back" | "body") => void;
  svgRef?: Ref<SVGSVGElement>;
  focusRoomId?: string;
}) {
  const minX = Math.min(...document.walls.flatMap(wall => [wall.start[0], wall.end[0]]));
  const minZ = Math.min(...document.walls.flatMap(wall => [wall.start[1], wall.end[1]]));
  const maxX = Math.max(...document.walls.flatMap(wall => [wall.start[0], wall.end[0]]));
  const maxZ = Math.max(...document.walls.flatMap(wall => [wall.start[1], wall.end[1]]));
  const focusedRoom = document.rooms.find(room => room.id === focusRoomId);
  const span = Math.max(maxX - minX, maxZ - minZ);
  // Focused typography depends on this room, never on the size of the house.
  const textSize = focusedRoom ? Math.max(focusedRoom.width, focusedRoom.depth) / 18 : Math.max(165, span / 55);
  const viewBox = focusedRoom
    ? `${focusedRoom.x - 350} ${focusedRoom.z - 650} ${focusedRoom.width + 700} ${focusedRoom.depth + 1100}`
    : `${minX - 550} ${minZ - 650} ${maxX - minX + 1100} ${maxZ - minZ + 1250}`;
  const color = (id: string) => document.materials.find(material => material.id === id)?.color ?? "#dae2e8";
  const selected = (id: string) => selectedIds.includes(id);
  return <svg ref={svgRef} className="house-plan" viewBox={viewBox} role="img" aria-label={`${focusedRoom ? `${focusedRoom.name} focused room` : document.name} floor plan`} xmlns="http://www.w3.org/2000/svg" style={{ fontFamily: "Arial, sans-serif" }}>
    <title>{`${focusedRoom?.name ?? document.name} — floor plan`}</title>
    <desc>Synthetic single-floor fixture. Measurements use millimetres. Select rooms, walls and objects using the selection controls.</desc>
    <rect x={minX - 550} y={minZ - 650} width={maxX - minX + 1100} height={maxZ - minZ + 1250} fill="#f4f6f8" />
    {document.rooms.map(room => <g key={room.id} onClick={() => onSelect?.(room.id, "floor")} style={{ cursor: onSelect ? "pointer" : undefined }}>
      <rect x={room.x} y={room.z} width={room.width} height={room.depth} fill={color(room.floorMaterialId)} fillOpacity="0.25" />
      {selected(room.id) && <rect x={room.x + 35} y={room.z + 35} width={room.width - 70} height={room.depth - 70} fill="#c52031" fillOpacity="0.07" stroke="#c52031" strokeWidth="25" />}
    </g>)}
    {document.walls.map(wall => {
      const length = Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1]);
      const nx = -(wall.end[1] - wall.start[1]) / length;
      const nz = (wall.end[0] - wall.start[0]) / length;
      return <g key={wall.id} style={{ cursor: onSelect ? "pointer" : undefined }}>
        <line x1={wall.start[0]} y1={wall.start[1]} x2={wall.end[0]} y2={wall.end[1]} stroke={selected(wall.id) ? "#c52031" : "#173447"} strokeWidth={wall.thickness + (selected(wall.id) ? 55 : 14)} strokeLinecap="square" />
        {(["front", "back"] as const).map((side, index) => {
          const offset = wall.thickness / 4 * (index === 0 ? 1 : -1);
          return <line key={side} x1={wall.start[0] + nx * offset} y1={wall.start[1] + nz * offset} x2={wall.end[0] + nx * offset} y2={wall.end[1] + nz * offset} stroke={color(side === "front" ? wall.frontMaterialId : wall.backMaterialId)} strokeWidth={wall.thickness / 2 - 8} onClick={() => onSelect?.(wall.id, side)} />;
        })}
      </g>;
    })}
    {document.openings.map(opening => {
      const wall = document.walls.find(wall => wall.id === opening.wallId)!;
      const length = Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1]);
      const dx = (wall.end[0] - wall.start[0]) / length, dz = (wall.end[1] - wall.start[1]) / length;
      const a = [wall.start[0] + dx * opening.offset, wall.start[1] + dz * opening.offset];
      const b = [a[0] + dx * opening.width, a[1] + dz * opening.width];
      const sign = wall.frontRoomId ? 1 : -1;
      const leaf = [a[0] - dz * opening.width * sign, a[1] + dx * opening.width * sign];
      return <g key={opening.id} onClick={() => onSelect?.(opening.id)} style={{ cursor: onSelect ? "pointer" : undefined }}>
        <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="#f4f6f8" strokeWidth={wall.thickness + 18} />
        {opening.kind === "window" ? <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={selected(opening.id) ? "#c52031" : "#4d89a6"} strokeWidth="35" /> : <>
          <line x1={a[0]} y1={a[1]} x2={leaf[0]} y2={leaf[1]} stroke={selected(opening.id) ? "#c52031" : "#8c6670"} strokeWidth="20" />
          <path d={`M ${b[0]} ${b[1]} A ${opening.width} ${opening.width} 0 0 ${sign === 1 ? 1 : 0} ${leaf[0]} ${leaf[1]}`} fill="none" stroke="#8c6670" strokeWidth="12" strokeDasharray="40 35" />
        </>}
      </g>;
    })}
    {document.instances.map(instance => {
      const asset = catalog.find(entry => entry.id === instance.catalogId)!;
      const [width, , depth] = instance.dimensions;
      const isLight = asset.kind === "light";
      return <g key={instance.id} transform={`translate(${instance.position[0]} ${instance.position[2]}) rotate(${instance.rotation})`} onClick={() => onSelect?.(instance.id, "body")} style={{ cursor: onSelect ? "pointer" : undefined }}>
        <rect x={-width / 2} y={-depth / 2} width={width} height={depth} rx={isLight ? width / 2 : 45} fill={color(instance.materialId)} stroke={selected(instance.id) ? "#c52031" : "#647684"} strokeWidth={selected(instance.id) ? 45 : 15} />
        {isLight && <circle r={width * 0.2} fill={instance.light?.enabled ? "#edb95c" : "#71808d"} />}
        {asset.id === "sofa" && <path d={`M ${-width / 2 + 100} ${-depth / 2 + 160} H ${width / 2 - 100} M 0 ${-depth / 2 + 160} V ${depth / 2 - 80}`} fill="none" stroke="#647684" strokeWidth="18" />}
        {asset.id === "bed" && <path d={`M ${-width / 2 + 70} ${-depth / 2 + 460} H ${width / 2 - 70}`} stroke="#647684" strokeWidth="25" />}
        {instance.locked && <text textAnchor="middle" y="45" fontSize="110" fill="#20303d">L</text>}
      </g>;
    })}
    {document.rooms.filter(() => !focusedRoom).map(room => {
      const labelWidth = Math.min(room.width - 100, Math.max(room.name.length * textSize * 0.68, textSize * 8.3));
      const centre = room.x + room.width / 2;
      return <g key={`label-${room.id}`} pointerEvents="none">
        <rect x={centre - labelWidth / 2} y={room.z + 110} width={labelWidth} height={textSize * 2.65} rx={45} fill="#ffffff" fillOpacity="0.94" />
        <text x={centre} y={room.z + 110 + textSize * 1.05} textAnchor="middle" fill="#173447" fontSize={textSize * 1.05} fontWeight="600">{room.name}</text>
        <text x={centre} y={room.z + 110 + textSize * 2.16} textAnchor="middle" fill="#536775" fontSize={textSize * 0.87}>{room.width / 1000} × {room.depth / 1000} m</text>
      </g>;
    })}
    {region && <rect x={region.x} y={region.z} width={region.width} height={region.depth} fill="#c52031" fillOpacity="0.07" stroke="#c52031" strokeWidth="25" strokeDasharray="95 65" pointerEvents="none" />}
    {!focusedRoom && <><g fill="#536775" fontSize={textSize * 0.85}><text x={minX} y={maxZ + 390}>Ceiling 2.8 m · assumed</text><text x={maxX} y={maxZ + 390} textAnchor="end">Synthetic fixture · mm</text></g>
    <g stroke="#647684" strokeWidth="10"><path d={`M ${minX} ${minZ - 360} H ${maxX} M ${minX} ${minZ - 440} V ${minZ - 280} M ${maxX} ${minZ - 440} V ${minZ - 280}`} /></g>
    <text x={(minX + maxX) / 2} y={minZ - 410} textAnchor="middle" fill="#536775" fontSize={textSize}>{(maxX - minX).toLocaleString("en-GB")} mm · wall centre lines</text></>}
  </svg>;
}
