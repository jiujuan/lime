use app_server_protocol::GalleryMaterialDeleteResponse;
use app_server_protocol::GalleryMaterialFilterParams;
use app_server_protocol::GalleryMaterialListResponse;
use app_server_protocol::GalleryMaterialLookupParams;
use app_server_protocol::GalleryMaterialMetadataCreateParams;
use app_server_protocol::GalleryMaterialMetadataResponse;
use app_server_protocol::GalleryMaterialMetadataUpdateParams;
use app_server_protocol::GalleryMaterialResponse;
use lime_core::database::dao::gallery_material_dao::GalleryMaterialDao;
use lime_core::database::DbConnection;
use lime_core::models::project_model as core_project_model;

pub(crate) fn get_gallery_material(
    db: &DbConnection,
    params: GalleryMaterialLookupParams,
) -> Result<GalleryMaterialResponse, String> {
    let conn = db
        .lock()
        .map_err(|error| format!("数据库锁定失败: {error}"))?;
    let material = GalleryMaterialDao::get_gallery_material(&conn, &params.material_id)
        .map_err(|error| error.to_string())?
        .map(protocol_gallery_material_from_core);
    Ok(GalleryMaterialResponse { material })
}

pub(crate) fn create_gallery_material_metadata(
    db: &DbConnection,
    params: GalleryMaterialMetadataCreateParams,
) -> Result<GalleryMaterialMetadataResponse, String> {
    let req = core_gallery_material_metadata_request_from_protocol(params);
    let conn = db
        .lock()
        .map_err(|error| format!("数据库锁定失败: {error}"))?;
    let metadata = GalleryMaterialDao::create(&conn, &req)
        .map_err(|error| error.to_string())
        .map(protocol_gallery_material_metadata_from_core)?;
    Ok(GalleryMaterialMetadataResponse {
        metadata: Some(metadata),
    })
}

pub(crate) fn get_gallery_material_metadata(
    db: &DbConnection,
    params: GalleryMaterialLookupParams,
) -> Result<GalleryMaterialMetadataResponse, String> {
    let conn = db
        .lock()
        .map_err(|error| format!("数据库锁定失败: {error}"))?;
    let metadata = GalleryMaterialDao::get(&conn, &params.material_id)
        .map_err(|error| error.to_string())?
        .map(protocol_gallery_material_metadata_from_core);
    Ok(GalleryMaterialMetadataResponse { metadata })
}

pub(crate) fn update_gallery_material_metadata(
    db: &DbConnection,
    params: GalleryMaterialMetadataUpdateParams,
) -> Result<GalleryMaterialMetadataResponse, String> {
    let mut req = core_gallery_material_metadata_request_from_protocol(params.metadata);
    req.material_id = params.material_id.clone();
    let conn = db
        .lock()
        .map_err(|error| format!("数据库锁定失败: {error}"))?;
    let metadata = GalleryMaterialDao::update(&conn, &params.material_id, &req)
        .map_err(|error| error.to_string())
        .map(protocol_gallery_material_metadata_from_core)?;
    Ok(GalleryMaterialMetadataResponse {
        metadata: Some(metadata),
    })
}

pub(crate) fn delete_gallery_material_metadata(
    db: &DbConnection,
    params: GalleryMaterialLookupParams,
) -> Result<GalleryMaterialDeleteResponse, String> {
    let conn = db
        .lock()
        .map_err(|error| format!("数据库锁定失败: {error}"))?;
    GalleryMaterialDao::delete(&conn, &params.material_id).map_err(|error| error.to_string())?;
    Ok(GalleryMaterialDeleteResponse {})
}

pub(crate) fn list_gallery_materials_by_image_category(
    db: &DbConnection,
    params: GalleryMaterialFilterParams,
) -> Result<GalleryMaterialListResponse, String> {
    let conn = db
        .lock()
        .map_err(|error| format!("数据库锁定失败: {error}"))?;
    let materials = GalleryMaterialDao::list_gallery_materials_by_image_category(
        &conn,
        &params.project_id,
        params.category.as_deref(),
    )
    .map_err(|error| error.to_string())?
    .into_iter()
    .map(protocol_gallery_material_from_core)
    .collect();
    Ok(GalleryMaterialListResponse { materials })
}

pub(crate) fn list_gallery_materials_by_layout_category(
    db: &DbConnection,
    params: GalleryMaterialFilterParams,
) -> Result<GalleryMaterialListResponse, String> {
    let conn = db
        .lock()
        .map_err(|error| format!("数据库锁定失败: {error}"))?;
    let materials = GalleryMaterialDao::list_gallery_materials_by_layout_category(
        &conn,
        &params.project_id,
        params.category.as_deref(),
    )
    .map_err(|error| error.to_string())?
    .into_iter()
    .map(protocol_gallery_material_from_core)
    .collect();
    Ok(GalleryMaterialListResponse { materials })
}

pub(crate) fn list_gallery_materials_by_mood(
    db: &DbConnection,
    params: GalleryMaterialFilterParams,
) -> Result<GalleryMaterialListResponse, String> {
    let conn = db
        .lock()
        .map_err(|error| format!("数据库锁定失败: {error}"))?;
    let mood = params.mood.as_deref().or(params.category.as_deref());
    let materials =
        GalleryMaterialDao::list_gallery_materials_by_mood(&conn, &params.project_id, mood)
            .map_err(|error| error.to_string())?
            .into_iter()
            .map(protocol_gallery_material_from_core)
            .collect();
    Ok(GalleryMaterialListResponse { materials })
}

fn protocol_gallery_material_metadata_from_core(
    metadata: core_project_model::GalleryMaterialMetadata,
) -> app_server_protocol::GalleryMaterialMetadata {
    app_server_protocol::GalleryMaterialMetadata {
        material_id: metadata.material_id,
        image_category: metadata.image_category,
        width: metadata.width,
        height: metadata.height,
        thumbnail: metadata.thumbnail,
        colors: metadata.colors,
        icon_style: metadata.icon_style,
        icon_category: metadata.icon_category,
        color_scheme_json: metadata.color_scheme_json,
        mood: metadata.mood,
        layout_category: metadata.layout_category,
        element_count: metadata.element_count,
        preview: metadata.preview,
        fabric_json: metadata.fabric_json,
        created_at: metadata.created_at,
        updated_at: metadata.updated_at,
    }
}

fn protocol_gallery_material_from_core(
    material: core_project_model::GalleryMaterial,
) -> app_server_protocol::GalleryMaterial {
    app_server_protocol::GalleryMaterial {
        id: material.base.id,
        project_id: material.base.project_id,
        name: material.base.name,
        material_type: material.base.material_type,
        file_path: material.base.file_path,
        file_size: material.base.file_size,
        mime_type: material.base.mime_type,
        content: material.base.content,
        tags: material.base.tags,
        description: material.base.description,
        created_at: material.base.created_at,
        metadata: material
            .metadata
            .map(protocol_gallery_material_metadata_from_core),
    }
}

fn core_gallery_material_metadata_request_from_protocol(
    params: GalleryMaterialMetadataCreateParams,
) -> core_project_model::CreateGalleryMaterialMetadataRequest {
    core_project_model::CreateGalleryMaterialMetadataRequest {
        material_id: params.material_id,
        image_category: params.image_category,
        width: params.width,
        height: params.height,
        thumbnail: params.thumbnail,
        colors: params.colors,
        icon_style: params.icon_style,
        icon_category: params.icon_category,
        color_scheme_json: params.color_scheme_json,
        mood: params.mood,
        layout_category: params.layout_category,
        element_count: params.element_count,
        preview: params.preview,
        fabric_json: params.fabric_json,
    }
}
