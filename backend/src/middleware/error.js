export function notFound(req, res) {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
}

export function errorHandler(error, req, res, next) {
  const status = error.status || 500;
  const message = status === 500 ? 'Something went wrong' : error.message;
  if (status === 500) {
    console.error(error);
  }
  res.status(status).json({ message, details: error.details });
}

