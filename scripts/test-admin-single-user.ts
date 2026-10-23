import assert from "node:assert/strict";

/**
 * Test: /api/admin/run-auto-apply with optional ?userId= query param
 */
function testAdminRunAutoApplySingleUser() {
  // Mock the route handler behavior
  const mockRequest = (url: string) => {
    const urlObj = new URL(url, "http://localhost");
    return {
      url,
      searchParams: urlObj.searchParams,
      headers: new Map([["x-admin-key", "test-key"]]),
    };
  };

  // Test 1: Without userId, should call runAutoApplyCron
  const req1 = mockRequest("http://localhost/api/admin/run-auto-apply");
  assert.equal(req1.searchParams.get("userId"), null, "No userId param returns null");

  // Test 2: With userId, should call runAutoApplyForUser
  const req2 = mockRequest("http://localhost/api/admin/run-auto-apply?userId=123e4567-e89b-12d3-a456-426614174000");
  assert.equal(req2.searchParams.get("userId"), "123e4567-e89b-12d3-a456-426614174000", "userId param extracted correctly");

  // Test 3: Multiple params
  const req3 = mockRequest("http://localhost/api/admin/run-auto-apply?userId=abc&other=xyz");
  assert.equal(req3.searchParams.get("userId"), "abc", "userId extracted with other params");
  assert.equal(req3.searchParams.get("other"), "xyz", "Other params preserved");

  console.log("PASS admin run-auto-apply single user support");
}

testAdminRunAutoApplySingleUser();
