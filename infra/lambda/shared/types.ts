// Mirrors the shapes documented in src/api/aws.js. Kept loose on purpose —
// node types and edge labels are user-defined data, not enums.
export interface NodeType { id: string; name: string; color: string; size: number; }
export interface GraphNode { id: string; label: string; typeId: string; notes: string; x: number; y: number; collapsed: boolean; }
export interface Edge { id: string; source: string; target: string; label: string; directed: boolean; }

export interface Comment { id: string; netId: string; authorId: string; authorName: string; text: string; createdAt: number; }

export type Role = "owner" | "editor" | "viewer";

export interface Collaborator { userId: string; email: string; name: string; role: "editor" | "viewer"; }

export interface Network {
  id: string;
  title: string;
  description: string;
  tags: string[];
  ownerId: string;
  ownerName: string;
  visibility: "public" | "private";
  nodeTypes: NodeType[];
  nodes: GraphNode[];
  edges: Edge[];
  likes: number;
  views: number;
  createdAt: number;
  updatedAt: number;
  collaborators?: Collaborator[]; // private sharing; absent = not shared
}

export interface Summary {
  id: string;
  title: string;
  description: string;
  tags: string[];
  author: string;
  likes: number;
  views: number;
  nodeCount: number;
  updatedAt: number;
  preview: {
    nodes: { x: number; y: number; t: string }[];
    edges: [string, string][];
    ids: string[];
    types: NodeType[];
  };
}
