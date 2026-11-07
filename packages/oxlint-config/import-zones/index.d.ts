type Names = readonly string[];

export interface ImportZonesEntry {
  readonly name: string;
  readonly from?: Names;
  readonly ignore?: Names;
  readonly reason?: string;
}

interface ImportZonesEdgeBase extends ImportZonesEntry {
  readonly from: Names;
  readonly allowTypeOnly?: boolean | Names;
  readonly allowWithin?: string;
}

export type ImportZonesEdge = ImportZonesEdgeBase &
  ({ readonly to: Names; readonly allow?: Names } | { readonly to?: Names; readonly allow: Names });

export interface ImportZonesModuleEntry extends ImportZonesEntry {
  readonly modules: Names;
  readonly allow: Names;
  readonly allowTypeOnly?: boolean;
}

export interface ImportZonesGlobalEntry extends ImportZonesEntry {
  readonly globals: Names;
  readonly allow: Names;
}

export interface ImportZonesUnzonedEntry extends ImportZonesEntry {
  readonly from: Names;
  readonly zones: Names;
}

export interface ImportZonesOptions {
  readonly zones?: Readonly<Record<string, Names>>;
  readonly extensions?: Names;
  readonly conditions?: Names;
  readonly workspaces?: Names;
  readonly edges?: readonly ImportZonesEdge[];
  readonly modules?: readonly ImportZonesModuleEntry[];
  readonly globals?: readonly ImportZonesGlobalEntry[];
  readonly unzoned?: readonly ImportZonesUnzonedEntry[];
  readonly unresolved?: readonly ImportZonesEntry[];
  readonly selfImports?: readonly ImportZonesEntry[];
}

export interface EdgeImport {
  readonly from: string;
  readonly to: string;
  readonly typeOnly?: boolean;
}

export declare const importZonesSchema: Readonly<Record<string, unknown>>;

export declare function collectRefusingEdges(
  options: ImportZonesOptions,
  edgeImport: EdgeImport,
): ImportZonesEdge[];
