CREATE POLICY "upload own reels" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'media' AND (storage.foldername(name))[1] = 'reels' AND (storage.foldername(name))[2] = auth.uid()::text);
CREATE POLICY "update own reels" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'media' AND (storage.foldername(name))[1] = 'reels' AND (storage.foldername(name))[2] = auth.uid()::text);
CREATE POLICY "delete own reels" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'media' AND (storage.foldername(name))[1] = 'reels' AND (storage.foldername(name))[2] = auth.uid()::text);