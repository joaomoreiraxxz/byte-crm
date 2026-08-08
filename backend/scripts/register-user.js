async function registerUser() {
  console.log('Fetching CSRF token...');
  const csrfRes = await fetch('https://api.bytecrm.online/api/v1/auth/csrf-token');
  const csrfData = await csrfRes.json();
  const csrfToken = csrfData.data.csrfToken;
  const cookie = csrfRes.headers.get('set-cookie');

  console.log('Sending registration request...');
  const res = await fetch('https://api.bytecrm.online/api/v1/auth/register', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrfToken,
      'Cookie': cookie
    },
    body: JSON.stringify({
      tenantName: 'Byte Force',
      tenantSlug: 'byte-force',
      fullName: 'João Moreira',
      email: 'moreiraxxz10@gmail.com',
      password: 'SenhaSegura123!'
    })
  });

  const data = await res.json();
  console.log('Result:', data);
}

registerUser();
