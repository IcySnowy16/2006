/** @campus-hop/shared: the one place the client and the server agree on shapes (task K1). */
export * from './common';
export * from './enums';
export * from './errors';
export * from './api';
export * from './realtime';
export * from './defaults';
export * from './features';
export * from './polyline';
export * as Account from './endpoints/account';
export * as Hop from './endpoints/hop';
export * as Trip from './endpoints/trip';
export type { Me } from './endpoints/account';
