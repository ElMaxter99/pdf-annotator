import packageJson from '../../package.json' with { type: 'json' };

type PackageAuthor = string | { name?: string } | undefined;

const resolveAuthor = (author: PackageAuthor) => {
  if (typeof author === 'string') {
    return author;
  }

  return author?.name ?? '';
};

export const APP_VERSION: string = packageJson.version;
export const APP_NAME: string = packageJson.name;
export const APP_AUTHOR: string = resolveAuthor(packageJson.author as PackageAuthor);
