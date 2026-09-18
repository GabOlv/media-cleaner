export function formatBytes(bytes: number | undefined): string {
  if (!bytes || bytes === 0 || isNaN(bytes)) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  if (i < 0 || i >= sizes.length) return `${bytes} B`;
  const val = bytes / Math.pow(k, i);
  return `${val.toFixed(val >= 10 || i === 0 ? 0 : 1)} ${sizes[i]}`;
}

export function formatRelativeDate(timestamp: number | undefined): string {
  if (!timestamp || isNaN(timestamp) || timestamp <= 0) {
    return 'Data recente';
  }

  // Se o timestamp estiver em segundos (padrão Android MediaStore), converte para milissegundos
  const ms = timestamp < 10000000000 ? timestamp * 1000 : timestamp;
  const date = new Date(ms);

  // Verificação de data válida
  if (isNaN(date.getTime())) {
    return 'Data recente';
  }

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffYears = Math.floor(diffDays / 365);
  const diffMonths = Math.floor(diffDays / 30);

  const formattedDate = date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  let relative = '';
  if (diffYears >= 1) {
    relative = `${diffYears} ${diffYears === 1 ? 'ano' : 'anos'} atrás`;
  } else if (diffMonths >= 1) {
    relative = `${diffMonths} ${diffMonths === 1 ? 'mês' : 'meses'} atrás`;
  } else if (diffDays >= 1) {
    relative = `${diffDays} ${diffDays === 1 ? 'dia' : 'dias'} atrás`;
  } else {
    relative = 'Hoje';
  }

  return `${formattedDate} (${relative})`;
}

export function formatDuration(seconds: number | undefined): string {
  if (!seconds || isNaN(seconds)) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}
