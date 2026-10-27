import { ResourceSlot } from "src/interfaces/resources";
import { API } from "./OmniAPI";

export async function fetchResources(offset?: number, limit?: number) {
    return await API.get('/resources', {offset, limit});
}

export async function newEditResource({id, }: {
    id?: string
}) {
    return await API.post(`/resources/${id ? id : 'new'}`, {

    });
}

export async function deleteResource(id: string) {
    
}

export async function fetchResourceSlots() {
    return await API.get('/resourceslots') as ResourceSlot[];
}
