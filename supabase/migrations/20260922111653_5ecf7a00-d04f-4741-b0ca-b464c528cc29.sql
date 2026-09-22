
CREATE POLICY "signed in can read media" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'media');
CREATE POLICY "upload own media" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'media' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "delete own media" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'media' AND (storage.foldername(name))[1] = auth.uid()::text);
