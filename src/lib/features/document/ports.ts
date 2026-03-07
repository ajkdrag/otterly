export interface DocumentPort {
  read_file(vault_id: string, relative_path: string): Promise<string>;
  resolve_asset_url(vault_id: string, relative_path: string): string;
}
