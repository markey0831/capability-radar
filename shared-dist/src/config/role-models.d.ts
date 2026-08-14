import type { RoleId, RoleModel } from '../domain/types';
export declare const ROLE_MODELS: readonly RoleModel[];
export declare const ROLE_MODEL_MAP: Map<RoleId, RoleModel>;
export declare function getRoleModel(roleId: RoleId): RoleModel;
