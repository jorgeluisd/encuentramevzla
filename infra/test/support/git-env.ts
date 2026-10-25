// La config global del desarrollador (firma de tags, hooks) no debe alterar los repos sintéticos.
export const isolatedGitEnv = { PATH: process.env.PATH ?? "", GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };
