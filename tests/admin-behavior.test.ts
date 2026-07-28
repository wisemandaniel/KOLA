import assert from "node:assert/strict";
import test from "node:test";

import {
  adminLevel,
  isAdministrator,
  isSuperadmin,
} from "../app/admin.ts";

test("explicit superadmin level has highest authority", () => {
  const actor = { admin_level: "superadmin", is_admin: 0 };

  assert.equal(adminLevel(actor), "superadmin");
  assert.equal(isAdministrator(actor), true);
  assert.equal(isSuperadmin(actor), true);
});

test("explicit admin level grants admin but not superadmin", () => {
  const actor = { admin_level: "admin", is_admin: 0 };

  assert.equal(adminLevel(actor), "admin");
  assert.equal(isAdministrator(actor), true);
  assert.equal(isSuperadmin(actor), false);
});

test("legacy is_admin flag remains backward compatible", () => {
  const actor = { admin_level: "", is_admin: 1 };

  assert.equal(adminLevel(actor), "admin");
  assert.equal(isAdministrator(actor), true);
  assert.equal(isSuperadmin(actor), false);
});

test("unknown or missing administrative values fail closed", () => {
  const actors = [
    {},
    { admin_level: "owner" },
    { admin_level: "SUPERADMIN" },
    { is_admin: 0 },
    { is_admin: "not-a-number" },
  ];

  for (const actor of actors) {
    assert.equal(adminLevel(actor), "none");
    assert.equal(isAdministrator(actor), false);
    assert.equal(isSuperadmin(actor), false);
  }
});
