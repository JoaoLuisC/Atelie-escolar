const { spawnSync } = require('node:child_process');

function run(command, args) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });

  return {
    ok: result.status === 0,
    status: result.status,
    stdout: String(result.stdout || '').trim(),
    stderr: String(result.stderr || '').trim(),
  };
}

function printBlock(title, lines) {
  console.log(`\n=== ${title} ===`);
  for (const line of lines) {
    if (line) {
      console.log(line);
    }
  }
}

function redactSensitiveOutput(text) {
  return String(text || '')
    .replaceAll(/(Publishable\s*│\s*)(.+)/gi, '$1[REDACTED]')
    .replaceAll(/(Secret\s*│\s*)(.+)/gi, '$1[REDACTED]')
    .replaceAll(/(Access Key\s*│\s*)(.+)/gi, '$1[REDACTED]')
    .replaceAll(/(Secret Key\s*│\s*)(.+)/gi, '$1[REDACTED]');
}

function main() {
  console.log('Supabase Doctor - local diagnostics');

  const dockerVersion = run('docker', ['--version']);
  if (!dockerVersion.ok) {
    printBlock('Docker', [
      'Docker CLI nao encontrado.',
      'Instale Docker Desktop e garanta que o comando docker esteja no PATH.',
      dockerVersion.stderr,
    ]);
    process.exit(1);
  }

  printBlock('Docker Version', [dockerVersion.stdout]);

  const dockerInfo = run('docker', ['info']);
  if (!dockerInfo.ok) {
    printBlock('Docker Engine', [
      'Docker Engine indisponivel.',
      'Abra o Docker Desktop e aguarde o status Running antes de usar supabase:start.',
      dockerInfo.stderr,
    ]);
    process.exit(1);
  }

  printBlock('Docker Engine', ['OK - Docker Engine em execucao.']);

  const supabaseVersion = run('npx', ['supabase', '--version']);
  if (!supabaseVersion.ok) {
    printBlock('Supabase CLI', [
      'Falha ao executar Supabase CLI.',
      'Rode: npm install',
      supabaseVersion.stderr,
    ]);
    process.exit(1);
  }

  printBlock('Supabase CLI Version', [supabaseVersion.stdout]);

  const supabaseStatus = run('npx', ['supabase', 'status']);
  if (!supabaseStatus.ok) {
    printBlock('Supabase Status', [
      'Nao foi possivel obter status da stack Supabase.',
      'Tente: npm run supabase:start',
      'Se falhar, tente: npm run supabase:doctor',
      supabaseStatus.stderr,
    ]);
    process.exit(1);
  }

  printBlock('Supabase Status', [redactSensitiveOutput(supabaseStatus.stdout)]);
  console.log('\nDoctor finalizado: ambiente pronto para desenvolvimento local.');
}

main();
