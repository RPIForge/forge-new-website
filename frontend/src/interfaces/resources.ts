export interface Resource {
    id: string;
    name: string;
    units: string;
    cost: number;
};

export interface ResourceSlot {
    id: string;
    name: string;
    db_name: string; // this NEEDS to be changed
    display_name: string;
    valid_resource_ids: string[];
    allow_own_material: boolean;
    allow_empty: boolean;
};