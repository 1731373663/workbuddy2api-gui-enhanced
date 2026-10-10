package api

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"
)

func (s *Server) handleAccountModels(w http.ResponseWriter, r *http.Request) {
	uid := strings.TrimSpace(r.PathValue("uid"))
	if uid == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "uid 不能为空"})
		return
	}
	models, err := s.svc.Gateway().AccountModels(r.Context(), uid)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, models)
}

func (s *Server) handleAccountModelSettingsPut(w http.ResponseWriter, r *http.Request) {
	uid := strings.TrimSpace(r.PathValue("uid"))
	if uid == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "uid 不能为空"})
		return
	}
	var req struct {
		EnabledModels []string          `json:"enabled_models"`
		Aliases       map[string]string `json:"model_aliases"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 2<<20)).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "参数错误: " + err.Error()})
		return
	}
	if err := s.svc.Gateway().SaveAccountModels(r.Context(), uid, req.EnabledModels, req.Aliases); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "message": "模型设置已保存"})
}
